import { useState } from "react";
import Dropdown from "./Dropdown";
import Button from "./Button";

const chains = ["Avalanche C-Chain", "Avalanche Fuji", "Hyperliquid Mainnet", "Hyperliquid Testnet"];
const categories = ["Art", "Music", "Games", "Other"];
const sorts = [
  { label: "Recently Listed", value: "recent" },
  { label: "Low to High", value: "asc" },
  { label: "High to Low", value: "desc" },
];

export function FiltersSidebar() {
  const [selectedChains, setSelectedChains] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sort, setSort] = useState("recent");

  const toggle = (
    value: string,
    list: string[],
    setter: (v: string[]) => void,
  ) => {
    setter(
      list.includes(value) ? list.filter((c) => c !== value) : [...list, value],
    );
  };

  return (
    <aside className="sticky top-0 p-4 space-y-6 border-r border-border h-screen overflow-y-auto hidden md:block">
      <div>
        <h3 className="mb-2 text-background font-semibold">Chains</h3>
        <div className="flex flex-wrap gap-2">
          {chains.map((c) => (
            <Button
              key={c}
              variant={selectedChains.includes(c) ? "primary" : "ghost"}
              className="text-sm"
              onClick={() => toggle(c, selectedChains, setSelectedChains)}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-background font-semibold">Categories</h3>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Button
              key={c}
              variant={selectedCategories.includes(c) ? "primary" : "ghost"}
              className="text-sm"
              onClick={() =>
                toggle(c, selectedCategories, setSelectedCategories)
              }
            >
              {c}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-background font-semibold">Sort By</h3>
        <Dropdown options={sorts} value={sort} onChange={setSort} />
      </div>
    </aside>
  );
}

export default FiltersSidebar;
