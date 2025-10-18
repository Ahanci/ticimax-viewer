import { useEffect, useMemo, useState } from "react";
import "./App.css";
import type { Catalog, Product, Category } from "./types";
import { fetchCatalog, parseTicimaxXml } from "./lib/xml";

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortKey, setSortKey] = useState<string>("name-asc");
  const [sourceLabel, setSourceLabel] = useState<string>("public/son_updated.xml");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const cat = await fetchCatalog();
        if (!active) return;
        setCatalog(cat);
        setError(null);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Beklenmeyen bir hata";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleXmlFileSelect(file: File) {
    try {
      setLoading(true);
      const text = await file.text();
      const cat = parseTicimaxXml(text);
      setCatalog(cat);
      setError(null);
      setSourceLabel(file.name);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Beklenmeyen bir hata";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(categoryName: string) {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  }

  function renderCategory(category: Category, level: number = 0) {
    const isExpanded = expandedCategories.has(category.name);
    const hasSubcategories = category.subcategories.length > 0;
    const indent = level * 16;

    return (
      <div key={category.name} style={{ marginLeft: indent }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {hasSubcategories && (
            <button
              onClick={() => toggleCategory(category.name)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                fontSize: 12,
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isExpanded ? "−" : "+"}
            </button>
          )}
          <button
            onClick={() => setSelectedCategory(category.name)}
            style={{
              textAlign: "left",
              background:
                selectedCategory === category.name ? "#333" : undefined,
              border: "none",
              padding: "4px 8px",
              cursor: "pointer",
              flex: 1,
              fontSize: level === 0 ? 14 : 12,
              fontWeight: level === 0 ? "bold" : "normal",
            }}
          >
            {category.displayName} ({category.productCount})
          </button>
        </div>
        {hasSubcategories && isExpanded && (
          <div style={{ marginTop: 4 }}>
            {category.subcategories.map((sub) =>
              renderCategory(sub, level + 1)
            )}
          </div>
        )}
      </div>
    );
  }

  const filteredProducts: Product[] = useMemo(() => {
    const products = catalog?.products ?? [];
    const byCategory = selectedCategory
      ? products.filter((p) => p.category === selectedCategory)
      : products;
    const q = query.trim().toLocaleLowerCase("tr");

    const bySearch = q
      ? byCategory.filter((p) =>
          [p.name, p.brand, p.sku].some((field) =>
            (field || "").toLocaleLowerCase("tr").includes(q)
          )
        )
      : byCategory;

    const min = priceMin ? Number(priceMin.replace(",", ".")) : undefined;
    const max = priceMax ? Number(priceMax.replace(",", ".")) : undefined;

    const byPrice = bySearch.filter((p) => {
      const effective = p.salePrice ?? p.price;
      if (effective == null) return false;
      if (min != null && Number.isFinite(min) && effective < min) return false;
      if (max != null && Number.isFinite(max) && effective > max) return false;
      return true;
    });

    const byStock = inStockOnly
      ? byPrice.filter((p) => (p.stock ?? 0) > 0)
      : byPrice;

    const byBrand = selectedBrands.length
      ? byStock.filter((p) =>
          p.brand ? selectedBrands.includes(p.brand) : false
        )
      : byStock;

    return byBrand;
  }, [
    catalog,
    selectedCategory,
    query,
    priceMin,
    priceMax,
    inStockOnly,
    selectedBrands,
  ]);

  const allBrands: string[] = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalog?.products || []) {
      if (p.brand) set.add(p.brand);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [catalog]);

  const sortedProducts: Product[] = useMemo(() => {
    const arr = filteredProducts.slice();
    const collator = new Intl.Collator("tr", { sensitivity: "base" });
    switch (sortKey) {
      case "price-asc":
        return arr.sort(
          (a, b) =>
            (a.salePrice ?? a.price ?? Infinity) -
            (b.salePrice ?? b.price ?? Infinity)
        );
      case "price-desc":
        return arr.sort(
          (a, b) =>
            (b.salePrice ?? b.price ?? -Infinity) -
            (a.salePrice ?? a.price ?? -Infinity)
        );
      case "brand-asc":
        return arr.sort((a, b) =>
          collator.compare(a.brand || "", b.brand || "")
        );
      case "name-desc":
        return arr.sort((a, b) => collator.compare(b.name, a.name));
      case "name-asc":
      default:
        return arr.sort((a, b) => collator.compare(a.name, b.name));
    }
  }, [filteredProducts, sortKey]);

  if (loading) return <p>Yükleniyor…</p>;
  if (error) return <p>Hata: {error}</p>;
  if (!catalog) return <p>Veri bulunamadı.</p>;

  return (
    <div
      style={{
        display: "block",
        paddingLeft: 272, // leave space for fixed sidebar (240 + gap)
      }}
    >
      <aside
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          width: 240,
          height: "calc(100vh - 32px)",
          overflow: "auto",
          textAlign: "left",
        }}
      >
        <h2>Kategoriler</h2>
        <div style={{ marginBottom: 12 }}>
          <h3>XML Yükle</h3>
          <input
            type="file"
            accept=".xml, text/xml, application/xml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleXmlFileSelect(f);
            }}
          />
          <small style={{ display: "block", marginTop: 6 }}>
            Kaynak: {sourceLabel}
          </small>
        </div>
        <button
          onClick={() => setSelectedCategory("")}
          style={{ display: "block", marginBottom: 8, width: "100%" }}
        >
          Tümü ({catalog.products.length})
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {catalog.categoryTree.map((category) => renderCategory(category))}
        </div>

        <div style={{ marginTop: 16 }}>
          <h3>Ara</h3>
          <input
            placeholder="Ürün adı/marka/SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <h3>Fiyat</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              placeholder="Min"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              style={{ width: "100%,", padding: 8 }}
            />
            <input
              type="number"
              placeholder="Maks"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
            Sadece stokta olanlar
          </label>
        </div>

        {allBrands.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3>Markalar</h3>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {allBrands.map((brand) => {
                const checked = selectedBrands.includes(brand);
                return (
                  <label
                    key={brand}
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedBrands((prev) =>
                          e.target.checked
                            ? [...prev, brand]
                            : prev.filter((b) => b !== brand)
                        );
                      }}
                    />
                    {brand}
                  </label>
                );
              })}
            </div>
            {selectedBrands.length > 0 && (
              <button
                style={{ marginTop: 8, width: "100%" }}
                onClick={() => setSelectedBrands([])}
              >
                Marka filtresini temizle
              </button>
            )}
          </div>
        )}
      </aside>

      <main>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h1 style={{ textAlign: "left", margin: 0 }}>Ürünler</h1>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Sırala:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
            >
              <option value="name-asc">Ada göre (A→Z)</option>
              <option value="name-desc">Ada göre (Z→A)</option>
              <option value="price-asc">Fiyat (Artan)</option>
              <option value="price-desc">Fiyat (Azalan)</option>
              <option value="brand-asc">Marka (A→Z)</option>
            </select>
          </label>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {sortedProducts.map((p) => (
            <article
              key={p.id}
              style={{
                border: "1px solid #333",
                borderRadius: 8,
                padding: 12,
                textAlign: "left",
              }}
            >
              {p.imageUrls[0] && (
                <img
                  src={p.imageUrls[0]}
                  alt={p.name}
                  style={{
                    width: "100%",
                    height: 180,
                    objectFit: "cover",
                    borderRadius: 6,
                  }}
                />
              )}
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <strong>{p.name}</strong>
                <small>{p.brand}</small>
                <small>SKU: {p.sku}</small>
                <div>
                  {p.salePrice ? (
                    <>
                      <span style={{ marginRight: 8 }}>
                        {formatPrice(p.salePrice, p.currency)}
                      </span>
                      {p.price && (
                        <s style={{ color: "#888" }}>
                          {formatPrice(p.price, p.currency)}
                        </s>
                      )}
                    </>
                  ) : (
                    <span>
                      {p.price ? formatPrice(p.price, p.currency) : "—"}
                    </span>
                  )}
                </div>
                {p.url && (
                  <a href={p.url} target="_blank">
                    Ürünü Gör
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function formatPrice(value?: number, currency?: string) {
  if (!value) return "";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency || "TRY",
    }).format(value);
  } catch {
    return `${value} ${currency || "TRY"}`;
  }
}

export default App;
