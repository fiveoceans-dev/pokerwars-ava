type BadgeProps = {
  label: string;
  variant?: "verified" | "new" | "sale";
};

const styles: Record<string, string> = {
  verified: "bg-accent text-white",
  new: "bg-green-500 text-white",
  sale: "bg-primary text-background",
};

export function Badge({ label, variant = "verified" }: BadgeProps): JSX.Element {
  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${styles[variant]}`}
    >
      {label}
    </span>
  );
}

export default Badge;
