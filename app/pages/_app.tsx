import {
  defaultTheme,
  SSRProvider,
  Provider as SpectrumProvider,
} from "@adobe/react-spectrum";
import CloseIcon from "@spectrum-icons/workflow/Close";
import * as anchor from "@project-serum/anchor";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { AppProps } from "next/app";
import Head from "next/head";
import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "react-query";
import { ReactQueryDevtools } from "react-query/devtools";
import { ToastContainer } from "react-toastify";
import { Nav } from "../components/nav";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";

const endpoints = {
  devnet: "https://psytrbhymqlkfrhudd.dev.genesysgo.net:8899/",
  mainnet: "https://ssc-dao.genesysgo.net/",
};

type ENV = keyof typeof endpoints;

function MyApp({ Component, pageProps }: AppProps) {
  const endpoint = endpoints[(process.env.NEXT_PUBLIC_ENV || "devnet") as ENV];
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <SSRProvider>
      <SpectrumProvider theme={defaultTheme} minHeight="100vh">
        <QueryClientProvider client={queryClient}>
          <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets}>
              <Head>
                <title>dexloan</title>
                <meta
                  name="viewport"
                  content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0,viewport-fit=cover"
                />
              </Head>
              <Nav />
              <Component {...pageProps} />
              <ToastContainer closeButton={CloseIcon} />
            </WalletProvider>
          </ConnectionProvider>
          <ReactQueryDevtools />
        </QueryClientProvider>
      </SpectrumProvider>
    </SSRProvider>
  );
}

export default MyApp;
