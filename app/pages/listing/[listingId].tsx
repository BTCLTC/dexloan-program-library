import * as anchor from "@project-serum/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Button, Divider, Flex, View, Well } from "@adobe/react-spectrum";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import * as utils from "../../utils";
import { ListingState } from "../../lib/web3";
import { useListingQuery } from "../../hooks/query";
import {
  useCancelMutation,
  useCloseAccountMutation,
  useLoanMutation,
  useRepaymentMutation,
  useRepossessMutation,
} from "../../hooks/mutation";
import { Body, Heading } from "../../components/typography";
import { LoadingPlaceholder } from "../../components/progress";
import { Main } from "../../components/layout";
import {
  CancelDialog,
  CloseAccountDialog,
  LoanDialog,
  RepayDialog,
  RepossessDialog,
} from "../../components/dialog";
import { useWalletConnect } from "../../components/button";
import { ExplorerLink } from "../../components/link";
import { ListingImage } from "../../components/image";

const Listing: NextPage = () => {
  const router = useRouter();
  const { listingId } = router.query;
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const pubkey = listingId
    ? new anchor.web3.PublicKey(listingId as string)
    : undefined;
  const listingQuery = useListingQuery(connection, pubkey);

  const listing = listingQuery.data?.listing;
  const metadata = listingQuery.data?.metadata;

  const hasExpired =
    listing &&
    utils.hasExpired(listing.startDate.toNumber(), listing.duration.toNumber());

  const isLender =
    listing && listing.lender.toBase58() === anchorWallet?.publicKey.toBase58();
  const isBorrower =
    listing &&
    listing.borrower.toBase58() === anchorWallet?.publicKey.toBase58();

  function getRepaymentText() {
    if (listing) {
      if (hasExpired) {
        return (
          <>
            is <strong>overdue</strong>.
          </>
        );
      }

      return (
        <>
          due by{" "}
          <strong>
            {utils.getFormattedDueDate(
              listing.startDate.toNumber(),
              listing.duration.toNumber()
            )}
          </strong>
          . Failure to repay the loan by this date may result in repossession of
          the NFT by the lender.
        </>
      );
    }
  }

  function renderActiveButton() {
    if (listing && pubkey && isBorrower) {
      return (
        <RepayButton
          escrow={listing.escrow}
          mint={listing.mint}
          listing={pubkey}
          lender={listing.lender}
        />
      );
    } else if (hasExpired && listing && pubkey && isLender) {
      return (
        <RepossessButton
          escrow={listing.escrow}
          mint={listing.mint}
          listing={pubkey}
        />
      );
    }

    return null;
  }

  function renderListedButton() {
    if (listing && pubkey && isBorrower) {
      return (
        <CancelButton
          escrow={listing.escrow}
          mint={listing.mint}
          listing={pubkey}
        />
      );
    } else if (listing && pubkey) {
      return (
        <LoanButton
          listing={pubkey}
          mint={listing.mint}
          borrower={listing.borrower}
          amount={listing.amount.toNumber()}
          basisPoints={listing.basisPoints}
        />
      );
    }
    return null;
  }

  function renderCloseAccountButton() {
    if (
      pubkey &&
      listing?.borrower.toBase58() === anchorWallet?.publicKey.toBase58()
    ) {
      return <CloseAccountButton listing={pubkey} />;
    }

    return null;
  }

  function renderByState() {
    if (listing === undefined) return null;

    switch (listing.state) {
      case ListingState.Listed:
        return (
          <>
            <View paddingBottom="size-100">
              <Body size="M">
                Lend&nbsp;
                {listing?.amount
                  ? listing.amount.toNumber() / anchor.web3.LAMPORTS_PER_SOL
                  : null}
                &nbsp;SOL for upto&nbsp;
                <strong>
                  {listing?.duration
                    ? utils.toMonths(listing.duration.toNumber())
                    : null}
                  &nbsp;months @&nbsp;
                </strong>
                <strong>
                  {listing?.basisPoints ? listing.basisPoints / 100 : null}%
                </strong>
                &nbsp;APY.
              </Body>
              <Body>
                After {utils.toMonths(listing.duration.toNumber())} months the
                total repayment required will be{" "}
                {utils
                  .totalAmount(
                    listing.amount.toNumber(),
                    Date.now() / 1000 - listing.duration.toNumber(),
                    listing.basisPoints
                  )
                  .toFixed(2)}{" "}
                SOL.
              </Body>
            </View>
            <View marginY="size-200">{renderListedButton()}</View>
          </>
        );

      case ListingState.Active:
        return (
          <>
            <View paddingBottom="size-100">
              <Body>
                {isLender ? "Lending" : "Borrowing"}&nbsp;
                <strong>
                  {listing.amount.toNumber() / anchor.web3.LAMPORTS_PER_SOL}
                  &nbsp;SOL
                </strong>
                &nbsp;for&nbsp;
                {utils.toMonths(listing.duration.toNumber())}
                &nbsp;months&nbsp;@&nbsp;
                <strong>{listing.basisPoints / 100}%</strong>
                &nbsp;APY.&nbsp;
              </Body>
            </View>
            <View paddingBottom="size-100">
              <Body>
                {utils
                  .totalAmount(
                    listing.amount.toNumber(),
                    listing.startDate.toNumber(),
                    listing.basisPoints
                  )
                  .toFixed(4)}{" "}
                SOL currently owed. Repayment {getRepaymentText()}
              </Body>
            </View>
            <View marginY="size-200">{renderActiveButton()}</View>
          </>
        );

      case ListingState.Repaid:
        return (
          <>
            <View marginBottom="size-300">
              <Body>Listing has ended. The loan was repaid.</Body>
            </View>
            <View marginY="size-200">{renderCloseAccountButton()}</View>
          </>
        );

      case ListingState.Cancelled:
        return (
          <>
            <View marginBottom="size-300">
              <Body>Listing cancelled.</Body>
            </View>
            <View marginY="size-200">{renderCloseAccountButton()}</View>
          </>
        );

      case ListingState.Defaulted:
        return (
          <>
            <View marginBottom="size-300">
              <Body>
                Listing has ended. The NFT was repossessed by the lender.
              </Body>
            </View>
            <View marginY="size-200">{renderCloseAccountButton()}</View>
          </>
        );

      default:
        return null;
    }
  }

  if (listingQuery.isLoading) {
    return <LoadingPlaceholder />;
  }

  if (listingQuery.error instanceof Error) {
    return (
      <Main>
        <View marginTop="size-400">
          <Flex direction="column" alignItems="center">
            <Heading size="M">404 Error</Heading>
            <Body>{listingQuery.error.message}</Body>
          </Flex>
        </View>
      </Main>
    );
  }

  return (
    <Main>
      <Flex direction="row" wrap="wrap">
        <Flex flex={1} direction="column" justifyContent="center">
          <View padding="size-100">
            <ListingImage uri={metadata?.data.data.uri} />
          </View>
        </Flex>
        <Flex flex={1} direction="column">
          <View paddingX="size-100" paddingY="size-200">
            <View>
              <Heading size="L">{metadata?.data.data.name}</Heading>
            </View>
            <View paddingY="size-200">
              <Divider size="M" />
            </View>
            {renderByState()}
          </View>
          <View>
            {listing?.borrower && (
              <Well>
                Borrower
                <br />
                <ExplorerLink address={listing.borrower}>
                  {listing.borrower?.toBase58()}
                </ExplorerLink>
              </Well>
            )}
            {listing?.lender && listing.state !== ListingState.Listed && (
              <Well>
                Lender
                <br />
                <ExplorerLink address={listing.lender}>
                  {listing.lender.toBase58()}
                </ExplorerLink>
              </Well>
            )}
            {listing?.mint && (
              <Well>
                Mint
                <br />
                <ExplorerLink address={listing.mint}>
                  {listing.mint.toBase58()}
                </ExplorerLink>
              </Well>
            )}
          </View>
        </Flex>
      </Flex>
    </Main>
  );
};

interface LoanButtonProps {
  mint: anchor.web3.PublicKey;
  borrower: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
  amount: number;
  basisPoints: number;
}

const LoanButton = ({
  mint,
  borrower,
  listing,
  amount,
  basisPoints,
}: LoanButtonProps) => {
  const [open, setDialog] = useState(false);
  const mutation = useLoanMutation(() => setDialog(false));
  const anchorWallet = useAnchorWallet();
  const [handleConnect] = useWalletConnect();

  async function onLend() {
    if (anchorWallet) {
      setDialog(true);
    } else {
      handleConnect(() => setDialog(true));
    }
  }

  return (
    <>
      <Button variant="cta" minWidth="size-2000" onPress={() => onLend()}>
        Lend SOL
      </Button>
      <LoanDialog
        open={open}
        loading={mutation.isLoading}
        amount={amount}
        basisPoints={basisPoints}
        onRequestClose={() => setDialog(false)}
        onConfirm={() =>
          mutation.mutate({
            mint,
            borrower,
            listing,
          })
        }
      />
    </>
  );
};

interface CancelButtonProps {
  mint: anchor.web3.PublicKey;
  escrow: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
}

const CancelButton = ({ mint, escrow, listing }: CancelButtonProps) => {
  const [dialog, setDialog] = useState(false);
  const mutation = useCancelMutation(() => setDialog(false));
  const anchorWallet = useAnchorWallet();
  const [handleConnect] = useWalletConnect();

  async function onCancel() {
    if (anchorWallet) {
      setDialog(true);
    } else {
      handleConnect(() => setDialog(true));
    }
  }

  return (
    <>
      <Button variant="cta" minWidth="size-2000" onPress={() => onCancel()}>
        Cancel Listing
      </Button>
      <CancelDialog
        open={dialog}
        loading={mutation.isLoading}
        onRequestClose={() => setDialog(false)}
        onConfirm={() => mutation.mutate({ mint, escrow, listing })}
      />
    </>
  );
};

interface RepayButtonProps extends CancelButtonProps {
  lender: anchor.web3.PublicKey;
}

const RepayButton = ({ mint, escrow, listing, lender }: RepayButtonProps) => {
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const mutation = useRepaymentMutation(() => setDialog(false));
  const anchorWallet = useAnchorWallet();
  const [handleConnect] = useWalletConnect();

  async function onRepay() {
    if (anchorWallet) {
      setDialog(true);
    } else {
      handleConnect(() => setDialog(true));
    }
  }

  useEffect(() => {
    if (mutation.isSuccess) {
      router.replace("/manage");
    }
  }, [router, mutation.isSuccess]);

  return (
    <>
      <Button variant="cta" minWidth="size-2000" onPress={() => onRepay()}>
        Repay Loan
      </Button>
      <RepayDialog
        open={dialog}
        loading={mutation.isLoading}
        onRequestClose={() => setDialog(false)}
        onConfirm={() =>
          mutation.mutate({
            mint,
            escrow,
            listing,
            lender,
          })
        }
      />
    </>
  );
};

interface RepossessButtonProps {
  mint: anchor.web3.PublicKey;
  escrow: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
}

const RepossessButton: React.FC<RepossessButtonProps> = ({
  mint,
  escrow,
  listing,
}) => {
  const [dialog, setDialog] = useState(false);
  const mutation = useRepossessMutation(() => setDialog(false));
  const anchorWallet = useAnchorWallet();
  const [handleConnect] = useWalletConnect();

  async function onRepossess() {
    if (anchorWallet) {
      setDialog(true);
    } else {
      handleConnect(() => setDialog(true));
    }
  }

  return (
    <>
      <Button variant="cta" minWidth="size-2000" onPress={() => onRepossess()}>
        Repossess NFT
      </Button>
      <RepossessDialog
        open={dialog}
        loading={mutation.isLoading}
        onRequestClose={() => setDialog(false)}
        onConfirm={() =>
          mutation.mutate({
            mint,
            escrow,
            listing,
          })
        }
      />
    </>
  );
};

interface CloseAcccountButtonProps {
  listing: anchor.web3.PublicKey;
}

export const CloseAccountButton: React.FC<CloseAcccountButtonProps> = ({
  listing,
}) => {
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const mutation = useCloseAccountMutation(() => setDialog(false));
  const anchorWallet = useAnchorWallet();
  const [handleConnect] = useWalletConnect();

  async function onClose() {
    if (anchorWallet) {
      setDialog(true);
    } else {
      handleConnect(() => setDialog(true));
    }
  }

  useEffect(() => {
    if (mutation.isSuccess) {
      router.replace("/manage");
    }
  }, [router, mutation.isSuccess]);

  return (
    <>
      <Button variant="cta" minWidth="size-2000" onPress={() => onClose()}>
        Close listing account
      </Button>
      <CloseAccountDialog
        open={dialog}
        loading={mutation.isLoading}
        onRequestClose={() => setDialog(false)}
        onConfirm={() =>
          mutation.mutate({
            listing,
          })
        }
      />
    </>
  );
};

export default Listing;
