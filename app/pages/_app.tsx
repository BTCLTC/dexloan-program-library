import {
  defaultTheme,
  SSRProvider,
  Provider as SpectrumProvider,
} from "@adobe/react-spectrum";
import * as anchor from "@project-serum/anchor";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { AppProps } from "next/app";
import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "react-query";
import { Nav } from "../components/nav";
import "./globals.css";

function MyApp({ Component, pageProps }: AppProps) {
  // You can also provide a custom RPC endpoint
  const endpoint = anchor.web3.clusterApiUrl("devnet"); // "http://localhost:8899";

  // @solana/wallet-adapter-wallets includes all the adapters but supports tree shaking and lazy loading --
  // Only the wallets you configure here will be compiled into your application, and only the dependencies
  // of wallets that your users connect to will be loaded
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <SSRProvider>
      <SpectrumProvider theme={defaultTheme} minHeight="100vh">
        <QueryClientProvider client={queryClient}>
          <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets}>
              <Nav />
              <Component {...pageProps} />
            </WalletProvider>
          </ConnectionProvider>
        </QueryClientProvider>
      </SpectrumProvider>
    </SSRProvider>
  );
}

export default MyApp;
