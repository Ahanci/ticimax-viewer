import type { Catalog, Product, Category } from "../types";

const LOCAL_XML_PATH = "/son_updated.xml"; // place son_updated.xml in the project's public/ folder

export async function fetchCatalog(): Promise<Catalog> {
  const bust = `${LOCAL_XML_PATH}`; // avoid 304 by cache-busting
  const response = await fetch(bust, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: ${response.status}`);
  }
  const xmlText = await response.text();
  return parseTicimaxXml(xmlText);
}

export function parseTicimaxXml(xmlText: string): Catalog {
  const parser = new DOMParser();

  const sanitizeXmlString = (s: string) => {
    // Strip BOM and zero-width spaces
    let t = s.replace(/[\uFEFF\u200B]+/g, "");
    // Remove ASCII control chars except TAB(9), LF(10), CR(13)
    t = Array.from(t)
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        if (code <= 31 && code !== 9 && code !== 10 && code !== 13)
          return false;
        return true;
      })
      .join("");
    // Encode bare ampersands not part of an entity
    t = t.replace(/&(?![a-zA-Z#][a-zA-Z0-9]+;)/g, "&amp;");
    return t;
  };

  const tryParse = (s: string): Document =>
    parser.parseFromString(s, "application/xml");

  let doc = tryParse(xmlText);
  let parserError = doc.querySelector("parsererror");
  if (parserError) {
    const sanitized = sanitizeXmlString(xmlText);
    doc = tryParse(sanitized);
    parserError = doc.querySelector("parsererror");
  }
  if (parserError) {
    // If still failing, try wrapping with a root (handles multiple top-level nodes)
    const wrapped = `<root>${sanitizeXmlString(xmlText)}</root>`;
    doc = tryParse(wrapped);
    parserError = doc.querySelector("parsererror");
  }
  if (parserError) {
    // Final fallback failed
    throw new Error("Invalid XML received from Ticimax");
  }

  // Helper function to safely query selectors
  const safeQuerySelector = (element: Element, selector: string): Element | null => {
    try {
      return element.querySelector(selector);
    } catch (e) {
      console.warn(`Invalid selector '${selector}':`, e);
      return null;
    }
  };

  const safeQuerySelectorAll = (element: Element, selector: string): Element[] => {
    try {
      return Array.from(element.querySelectorAll(selector));
    } catch (e) {
      console.warn(`Invalid selector '${selector}':`, e);
      return [];
    }
  };

  const productNodes = safeQuerySelectorAll(doc.documentElement, "Urun");
  if (productNodes.length === 0) {
    // Try alternative selectors if no products found
    productNodes.push(...safeQuerySelectorAll(doc.documentElement, "* > Urun"));
    productNodes.push(...safeQuerySelectorAll(doc.documentElement, "* > * > Urun"));
  }

  const products: Product[] = productNodes.map((node) => {
    const text = (sel: string) => {
      try {
        const element = safeQuerySelector(node, sel);
        return element?.textContent?.trim() || "";
      } catch (e) {
        console.warn(`Error getting text for selector '${sel}':`, e);
        return "";
      }
    };
    
    const number = (sel: string) => {
      try {
        const value = text(sel).replace(",", ".");
        const num = Number(value);
        return Number.isFinite(num) ? num : undefined;
      } catch (e) {
        console.warn(`Error converting to number for selector '${sel}':`, e);
        return undefined;
      }
    };

    // Get category info from KategoriTree
    const categoryTree = text("KategoriTree");
    const categoryPath = categoryTree
      ? categoryTree
          .split(" > ")
          .map((s) => s.trim())
          .filter(Boolean)
      : [text("Kategori")].filter(Boolean);
    const category = categoryPath[categoryPath.length - 1] || text("Kategori");

    const id = text("UrunKartiID") || crypto.randomUUID();
    const sku = text("StokKodu") || id;
    const name = text("UrunAdi") || sku;
    const brand = text("Marka") || undefined;

    // Get price from first option (Secenek)
    const firstOption = safeQuerySelector(node, "UrunSecenek > Secenek") || 
                       safeQuerySelector(node, "Secenek");
    const price = firstOption
      ? number(firstOption.querySelector("SatisFiyati")?.textContent || "")
      : undefined;
    const salePrice = firstOption
      ? number(firstOption.querySelector("IndirimliFiyat")?.textContent || "")
      : undefined;
    const currency = firstOption
      ? firstOption.querySelector("ParaBirimiKodu")?.textContent || "TRY"
      : "TRY";
    const stock = firstOption
      ? number(firstOption.querySelector("StokAdedi")?.textContent || "")
      : undefined;

    const imageUrls: string[] = [];
    // Look for images in various possible locations
    const resimNodes = safeQuerySelectorAll(node, "Resim");
    resimNodes.forEach((resimNode) => {
      const imgUrl = resimNode.textContent?.trim();
      if (imgUrl) imageUrls.push(imgUrl);
    });

    const url = text("UrunURL") || undefined;
    const description = text("Aciklama") || undefined;

    return {
      id,
      sku,
      name,
      brand,
      categoryPath,
      category,
      description,
      price,
      salePrice,
      currency,
      stock,
      imageUrls,
      url,
    };
  });

  const categories = Array.from(
    new Set(
      products.map((p) => p.category).filter((c): c is string => Boolean(c))
    )
  ).sort((a, b) => a.localeCompare(b, "tr"));

  // Build hierarchical category tree from products
  const categoryTree: Category[] = [];
  const categoryMap = new Map<string, Category>();

  // Build category tree from product category paths
  products.forEach((product) => {
    if (!product.categoryPath || product.categoryPath.length === 0) return;

    const mainCategoryName = product.categoryPath[0];
    const subCategoryName = product.categoryPath[1] || mainCategoryName;

    // Create or get main category
    if (!categoryMap.has(mainCategoryName)) {
      const mainCategory: Category = {
        name: mainCategoryName,
        displayName: mainCategoryName,
        subcategories: [],
        productCount: 0,
      };
      categoryMap.set(mainCategoryName, mainCategory);
      categoryTree.push(mainCategory);
    }

    const mainCategory = categoryMap.get(mainCategoryName)!;
    mainCategory.productCount++;

    // Create or get subcategory (if different from main)
    if (subCategoryName !== mainCategoryName) {
      let subCategory = mainCategory.subcategories.find(
        (sub) => sub.name === subCategoryName
      );
      if (!subCategory) {
        subCategory = {
          name: subCategoryName,
          displayName: subCategoryName,
          subcategories: [],
          productCount: 0,
        };
        mainCategory.subcategories.push(subCategory);
      }
      subCategory.productCount++;
    }
  });

  // Sort categories
  categoryTree.sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
  categoryTree.forEach((main) => {
    main.subcategories.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "tr")
    );
  });

  return { products, categories, categoryTree };
}
