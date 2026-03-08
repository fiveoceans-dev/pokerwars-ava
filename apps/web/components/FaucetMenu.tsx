"use client";
import { DropdownMenu, Button } from "@radix-ui/themes";
import { CaretDownIcon } from "@radix-ui/react-icons";
import { readPublicEnv } from "~~/utils/public-env";

export default function FaucetMenu() {
  const avalancheFaucet = readPublicEnv("NEXT_PUBLIC_AVALANCHE_TESTNET_FAUCET_URL");
  const hyperliquidFaucet = readPublicEnv("NEXT_PUBLIC_HYPERLIQUID_TESTNET_FAUCET_URL");
  const faucetUrl = avalancheFaucet || hyperliquidFaucet;
  const faucetLabel = avalancheFaucet ? "Avalanche Fuji Faucet" : "Hyperliquid Testnet Faucet";

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
          <a href={faucetUrl}>{faucetLabel}</a>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
