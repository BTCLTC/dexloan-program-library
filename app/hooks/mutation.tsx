import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import * as anchor from "@project-serum/anchor";
import { QueryClient, useMutation, useQueryClient } from "react-query";
import { toast } from "react-toastify";

import * as web3 from "../lib/web3";

interface RepossessMutationProps {
  escrow: anchor.web3.PublicKey;
  mint: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
}

export const useRepossessMutation = (onSuccess: () => void) => {
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  return useMutation<void, Error, RepossessMutationProps>(
    async ({ mint, escrow, listing }) => {
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
      onSuccess(_, variables) {
        toast.success("NFT repossessed.");

        queryClient.setQueryData(
          ["loans", anchorWallet?.publicKey.toBase58()],
          (loans: any[] | undefined) => {
            if (!loans) return [];

            return loans.filter(
              (loans) =>
                loans.listing.publicKey.toBase58() !==
                variables.listing.toBase58()
            );
          }
        );

        setListingState(
          queryClient,
          variables.listing,
          web3.ListingState.Defaulted
        );

        onSuccess();
      },
    }
  );
};

interface RepaymentMutationProps extends RepossessMutationProps {
  lender: anchor.web3.PublicKey;
}

export const useRepaymentMutation = (onSuccess: () => void) => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const queryClient = useQueryClient();

  return useMutation<void, Error, RepaymentMutationProps>(
    ({ mint, escrow, listing, lender }) => {
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
      onSuccess(_, variables) {
        toast.success("Loan repaid. Your NFT has been returned to you.");

        queryClient.setQueryData(
          ["borrowings", anchorWallet?.publicKey.toBase58()],
          (borrowings: any[] | undefined) => {
            if (!borrowings) return [];

            return borrowings.filter(
              (borrowing) =>
                borrowing.listing.publicKey.toBase58() !==
                variables.listing.toBase58()
            );
          }
        );

        setListingState(
          queryClient,
          variables.listing,
          web3.ListingState.Repaid
        );

        onSuccess();
      },
    }
  );
};

interface CancelMutationProps extends RepossessMutationProps {}

export const useCancelMutation = (onSuccess: () => void) => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const queryClient = useQueryClient();

  return useMutation<void, Error, CancelMutationProps>(
    ({ mint, escrow, listing }) => {
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
      onSuccess(_, variables) {
        toast.success("Listing cancelled");

        queryClient.setQueryData(
          ["listings", anchorWallet?.publicKey.toBase58()],
          (listings: any[] | undefined) => {
            if (!listings) return [];

            return listings.filter(
              (item) =>
                item.listing.publicKey.toBase58() !==
                variables.listing.toBase58()
            );
          }
        );

        setListingState(
          queryClient,
          variables.listing,
          web3.ListingState.Cancelled
        );

        onSuccess();
      },
    }
  );
};

interface LoanMutationProps {
  mint: anchor.web3.PublicKey;
  borrower: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
}

export const useLoanMutation = (onSuccess: () => void) => {
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  return useMutation<void, Error, LoanMutationProps>(
    async ({ mint, borrower, listing }) => {
      if (anchorWallet) {
        return web3.createLoan(
          connection,
          anchorWallet,
          mint,
          borrower,
          listing
        );
      }
      throw new Error("Not ready");
    },
    {
      onSuccess(_, variables) {
        toast.success("Listing created");

        queryClient.setQueryData(["listings"], (data: any) => {
          if (data) {
            return data?.filter(
              (item: any) =>
                item.listing.publicKey.toBase58() !==
                variables.listing.toBase58()
            );
          }
        });

        setListingState(
          queryClient,
          variables.listing,
          web3.ListingState.Active
        );

        queryClient.invalidateQueries([
          "loans",
          anchorWallet?.publicKey.toBase58(),
        ]);

        onSuccess();
      },
      onError(err) {
        console.error(err);
        if (err instanceof Error) {
          toast.error("Error: " + err.message);
        }
      },
    }
  );
};

interface CloseMutationVariables {
  listing: anchor.web3.PublicKey;
}

export const useCloseAccountMutation = (onSuccess: () => void) => {
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  return useMutation<void, Error, CloseMutationVariables>(
    async ({ listing }) => {
      if (anchorWallet) {
        return web3.closeAccount(connection, anchorWallet, listing);
      }
      throw new Error("Not ready");
    },
    {
      onSuccess(_, variables) {
        toast.success("Listing account closed");

        queryClient.setQueryData(
          ["finalized", anchorWallet?.publicKey.toBase58()],
          (data: any) => {
            if (data) {
              return data?.filter(
                (item: any) =>
                  item.listing.publicKey.toBase58() !==
                  variables.listing.toBase58()
              );
            }
          }
        );

        onSuccess();
      },
      onError(err) {
        console.error(err);
        if (err instanceof Error) {
          toast.error("Error: " + err.message);
        }
      },
    }
  );
};

function setListingState(
  queryClient: QueryClient,
  listing: anchor.web3.PublicKey,
  state: web3.ListingState
) {
  queryClient.setQueryData(["listing", listing.toBase58()], (data: any) => {
    if (data) {
      return {
        ...data,
        listing: {
          ...data.listing,
          state,
        },
      };
    }
  });
}
