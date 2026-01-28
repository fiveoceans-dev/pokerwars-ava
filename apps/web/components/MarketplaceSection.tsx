import NFTCard from "./ui/NFTCard";
import NFTGrid from "./ui/NFTGrid";
import FiltersSidebar from "./ui/FiltersSidebar";

const items = Array.from({ length: 8 }).map((_, i) => ({
  id: i,
  title: `NFT Item ${i + 1}`,
  image: "/nft.png",
  creator: "/pokerwars_logo.svg",
  price: `${(i + 1) * 0.1} HYPE`,
  chainIcon: "/explorer-icon.svg",
}));

export default function MarketplaceSection() {
  return (
    <section
      id="marketplace"
      className="py-12 px-4 sm:px-6 md:px-12 bg-white dark:bg-gray-900"
    >
      <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-6">
        <div className="md:col-span-3 mb-6 md:mb-0">
          <FiltersSidebar />
        </div>
        <div className="md:col-span-9">
          <NFTGrid>
            {items.map((item) => (
              <NFTCard key={item.id} {...item} />
            ))}
          </NFTGrid>
        </div>
      </div>
    </section>
  );
}
