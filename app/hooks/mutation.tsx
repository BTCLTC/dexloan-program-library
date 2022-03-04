import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import * as anchor from "@project-serum/anchor";
import { useMutation, useQueryClient } from "react-query";
import { toast } from "react-toastify";

import * as web3 from "../lib/web3";

interface UseRepossessMutationProps {
  escrow: anchor.web3.PublicKey;
  mint: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
}

export const useRepossessMutation = ({
  mint,
  escrow,
  listing,
}: UseRepossessMutationProps) => {
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  return useMutation(
    async () => {
      if (anchorWallet && wallet.publicKey) {
        const lenderTokenAccount = await web3.getOrCreateTokenAccount(
          connection,
          wallet,
          mint
        );

        return web3.repossessCollateral(
          connection,
          anchorWallet,
          mint,
          escrow,
          lenderTokenAccount,
          listing
        );
      }
      throw new Error("Not ready");
    },
    {
      onError(err) {
        console.error(err);
        if (err instanceof Error) {
          toast.error("Error: " + err.message);
        }
      },
      onSuccess() {
        toast.success("NFT repossessed.");

        queryClient.setQueryData(
          ["loans", anchorWallet?.publicKey.toBase58()],
          (loans: any[] | undefined) => {
            if (!loans) return [];

            return loans.filter(
              (loans) =>
                loans.listing.publicKey.toBase58() !== listing.toBase58()
            );
          }
        );

        queryClient.setQueryData(
          ["listing", listing.toBase58()],
          (data: any) => {
            if (data) {
              return {
                ...data,
                listing: {
                  ...data.listing,
                  status: web3.ListingState.Defaulted,
                },
              };
            }
          }
        );
      },
    }
  );
};

interface UseRepaymentMutationProps extends UseRepossessMutationProps {
  lender: anchor.web3.PublicKey;
}

export const UseRepaymentMutation = ({
  mint,
  escrow,
  listing,
  lender,
}: UseRepaymentMutationProps) => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const queryClient = useQueryClient();

  return useMutation(
    () => {
      if (anchorWallet) {
        return web3.repayLoan(
          connection,
          anchorWallet,
          mint,
          lender,
          listing,
          escrow
        );
      }
      throw new Error("Not ready");
    },
    {
      onError(err) {
        console.error(err);
        if (err instanceof Error) {
          toast.error("Error: " + err.message);
        }
      },
      onSuccess() {
        toast.success("Loan repaid. Your NFT has been returned to you.");

        queryClient.setQueryData(
          ["borrowings", anchorWallet?.publicKey.toBase58()],
          (borrowings: any[] | undefined) => {
            if (!borrowings) return [];

            return borrowings.filter(
              (borrowing) =>
                borrowing.listing.publicKey.toBase58() !== listing.toBase58()
            );
          }
        );

        queryClient.setQueryData(
          ["listing", listing.toBase58()],
          (data: any) => {
            if (data) {
              return {
                ...data,
                listing: {
                  ...data.listing,
                  status: web3.ListingState.Repaid,
                },
              };
            }
          }
        );
      },
    }
  );
};

interface UseCancelMutationProps extends UseRepossessMutationProps {}

export const useCancelMutation = ({
  mint,
  escrow,
  listing,
}: UseCancelMutationProps) => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const queryClient = useQueryClient();

  return useMutation(
    () => {
      if (anchorWallet) {
        return web3.cancelListing(
          connection,
          anchorWallet,
          mint,
          listing,
          escrow
        );
      }
      throw new Error("Not ready");
    },
    {
      onError(err) {
        console.error(err);
        if (err instanceof Error) {
          toast.error("Error: " + err.message);
        }
      },
      onSuccess() {
        console.log("success!");
        toast.success("Listing cancelled");

        queryClient.setQueryData(
          ["listings", anchorWallet?.publicKey.toBase58()],
          (listings: any[] | undefined) => {
            if (!listings) return [];

            return listings.filter(
              (item) => item.listing.publicKey.toBase58() !== listing.toBase58()
            );
          }
        );
      },
    }
  );
};
