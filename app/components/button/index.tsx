import { useCallback, useMemo } from "react";
import { ActionButton, Button } from "@adobe/react-spectrum";
import { useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletName } from "@solana/wallet-adapter-wallets";

export function useWalletConnect(): [(cb?: () => void) => void, string] {
  const wallet = useWallet();
  wallet.select(PhantomWalletName);

  const label = useMemo(() => {
    if (wallet.publicKey) {
      const base58 = wallet.publicKey.toBase58();
      return base58.slice(0, 4) + "..." + base58.slice(base58.length - 4);
    }

    return "Connect Wallet";
  }, [wallet.publicKey]);

  const handleConnect = useCallback(
    async (cb?: () => void) => {
      try {
        if (!wallet.publicKey) await wallet.connect();
        else await wallet.disconnect();
        if (cb) cb();
      } catch (err) {
        console.log(err);
      }
    },
    [wallet]
  );

  return [handleConnect, label];
}

export const ConnectWalletActionButton = () => {
  const [handleConnect, label] = useWalletConnect();

  return <ActionButton onPress={() => handleConnect()}>{label}</ActionButton>;
};

export const ConnectWalletButton = () => {
  const [handleConnect, label] = useWalletConnect();

  return (
    <Button variant="cta" onPress={() => handleConnect()}>
      {label}
    </Button>
  );
};
