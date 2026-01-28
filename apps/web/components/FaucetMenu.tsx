"use client";
import { DropdownMenu, Button } from "@radix-ui/themes";
import { CaretDownIcon } from "@radix-ui/react-icons";

export default function FaucetMenu() {
  const faucetUrl = process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL;

  if (!faucetUrl) {
    return null;
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button variant="outline">
          Faucet <CaretDownIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item>
          <a href={faucetUrl}>Hyperliquid Testnet Faucet</a>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
