type GridProps = {
  children: React.ReactNode;
};

export function NFTGrid({ children }: GridProps): JSX.Element {
  return <div className="flex flex-wrap justify-center gap-4 md:gap-6">{children}</div>;
}

export default NFTGrid;
