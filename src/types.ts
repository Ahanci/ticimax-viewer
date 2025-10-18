export type Product = {
  id: string;
  sku: string;
  name: string;
  brand?: string;
  categoryPath?: string[]; // hierarchical categories from XML breadcrumbs
  category?: string; // leaf category convenience
  description?: string;
  price?: number;
  salePrice?: number;
  currency?: string;
  stock?: number;
  imageUrls: string[];
  url?: string;
};

export type Category = {
  name: string;
  displayName: string;
  subcategories: Category[];
  productCount: number;
};

export type Catalog = {
  products: Product[];
  categories: string[]; // unique leaf categories extracted
  categoryTree: Category[]; // hierarchical category structure
};
