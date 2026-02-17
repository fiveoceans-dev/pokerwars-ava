import Image from "next/image";

type AvatarProps = {
  src: string;
  alt: string;
  size?: number;
  variant?: "circle" | "square";
};

export function Avatar({
  src,
  alt,
  size = 40,
  variant = "circle",
}: AvatarProps) {
  return (
    <div
      className={`overflow-hidden ${
        variant === "circle" ? "rounded-full" : "rounded-md"
      }`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="object-cover"
      />
    </div>
  );
}

export default Avatar;
