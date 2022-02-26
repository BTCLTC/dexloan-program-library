import * as anchor from "@project-serum/anchor";
import {
  Button,
  Divider,
  Flex,
  StatusLight,
  View,
  Link as SpectrumLink,
} from "@adobe/react-spectrum";
import {
  useConnection,
  useAnchorWallet,
  useWallet,
} from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useMutation, useQueryClient } from "react-query";
import { toast } from "react-toastify";
import * as utils from "../utils";
import * as web3 from "../lib/web3";
import {
  useLoansQuery,
  useBorrowingsQuery,
  useListingsByOwnerQuery,
} from "../hooks/query";
import { ConnectWalletButton } from "../components/button";
import { Card, CardFlexContainer } from "../components/card";
import { LoadingPlaceholder } from "../components/progress";
import { Typography, Body, Heading } from "../components/typography";
import { Main } from "../components/layout";

const Manage: NextPage = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();

  const loansQueryResult = useLoansQuery(connection, anchorWallet);
  const borrowingsQueryResult = useBorrowingsQuery(connection, anchorWallet);
  const listingsQueryResult = useListingsByOwnerQuery(connection, anchorWallet);

  if (!anchorWallet) {
    return (
      <Flex direction="row" justifyContent="center">
        <View marginY="size-2000">
          <ConnectWalletButton />
        </View>
      </Flex>
    );
  }

  if (
    loansQueryResult.isLoading ||
    borrowingsQueryResult.isLoading ||
    listingsQueryResult.isLoading
  ) {
    return <LoadingPlaceholder />;
  }

  return (
    <>
      <Main>
        {loansQueryResult.data?.length ? (
          <>
            <View marginBottom="size-200" marginTop="size-600">
              <Typography>
                <Heading>Your Loans</Heading>
              </Typography>
            </View>
            <CardFlexContainer>
              {loansQueryResult.data?.map(
                (item) =>
                  item && (
                    <LoanCard
                      key={item.listing.publicKey?.toBase58()}
                      amount={item.listing.account.amount.toNumber()}
                      basisPoints={item.listing.account.basisPoints}
                      duration={item.listing.account.duration.toNumber()}
                      name={item.metadata.data?.data?.name}
                      escrow={item.listing.account.escrow}
                      listing={item.listing.publicKey}
                      mint={item.listing.account.mint}
                      startDate={item.listing.account.startDate.toNumber()}
                      uri={item.metadata.data?.data?.uri}
                    />
                  )
              )}
            </CardFlexContainer>
          </>
        ) : null}
        {borrowingsQueryResult.data?.length ? (
          <>
            <View marginBottom="size-200" marginTop="size-600">
              {loansQueryResult.data?.length ? <Divider size="M" /> : null}
              <Typography>
                <Heading>Your Borrowings</Heading>
              </Typography>
            </View>
            <CardFlexContainer>
              {borrowingsQueryResult.data?.map(
                (item) =>
                  item && (
                    <BorrowingCard
                      key={item.listing.publicKey.toBase58()}
                      amount={item.listing.account.amount.toNumber()}
                      basisPoints={item.listing.account.basisPoints}
                      duration={item.listing.account.duration.toNumber()}
                      name={item.metadata.data.data.name}
                      escrow={item.listing.account.escrow}
                      lender={item.listing.account.lender}
                      listing={item.listing.publicKey}
                      mint={item.listing.account.mint}
                      startDate={item.listing.account.startDate.toNumber()}
                      uri={item.metadata.data.data.uri}
                    />
                  )
              )}
            </CardFlexContainer>
          </>
        ) : null}
        {listingsQueryResult.data?.length ? (
          <>
            <View marginBottom="size-200" marginTop="size-600">
              {borrowingsQueryResult.data?.length ? <Divider size="M" /> : null}
              <Typography>
                <Heading>Listed</Heading>
              </Typography>
            </View>
            <CardFlexContainer>
              {listingsQueryResult.data?.map(
                (item) =>
                  item && (
                    <ListedCard
                      key={item.listing.publicKey?.toBase58()}
                      amount={item.listing.account.amount.toNumber()}
                      basisPoints={item.listing.account.basisPoints}
                      duration={item.listing.account.duration.toNumber()}
                      escrow={item.listing.account.escrow}
                      listing={item.listing.publicKey}
                      name={item.metadata.data?.data?.name}
                      mint={item.listing.account.mint}
                      uri={item.metadata.data?.data?.uri}
                    />
                  )
              )}
            </CardFlexContainer>
          </>
        ) : null}
      </Main>
    </>
  );
};

interface LoanCardProps {
  amount: number;
  name: string;
  escrow: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
  mint: anchor.web3.PublicKey;
  basisPoints: number;
  duration: number;
  startDate: number;
  uri: string;
}

const LoanCard: React.FC<LoanCardProps> = ({
  amount,
  basisPoints,
  duration,
  escrow,
  listing,
  mint,
  name,
  startDate,
  uri,
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const queryClient = useQueryClient();

  const mutation = useMutation(
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
      },
    }
  );

  return (
    <Card uri={uri}>
      <Typography>
        <Heading size="S">{name}</Heading>
        <Body size="S">
          Lending&nbsp;
          <strong>
            {amount / anchor.web3.LAMPORTS_PER_SOL}
            &nbsp;SOL
          </strong>
          &nbsp;for&nbsp;
          {utils.toMonths(duration)}
          &nbsp;months&nbsp;@&nbsp;
          <strong>{basisPoints / 100}%</strong>
          &nbsp;APR.&nbsp;
          <SpectrumLink>
            <a
              href={`https://explorer.solana.com/address/${mint}`}
              target="_blank"
              rel="noreferrer"
            >
              View in Explorer
            </a>
          </SpectrumLink>
        </Body>
      </Typography>
      <Divider size="S" marginTop="size-600" />
      <Flex direction="row" justifyContent="end">
        {utils.hasExpired(startDate, duration) ? (
          <Button
            marginY="size-200"
            variant="primary"
            onPress={() => mutation.mutate()}
          >
            Repossess
          </Button>
        ) : (
          <StatusLight marginY="size-200" marginX="size-50" variant="positive">
            {utils.yieldGenerated(amount, startDate, basisPoints).toFixed(4)}{" "}
            SOL earned - due {utils.getFormattedDueDate(startDate, duration)}
          </StatusLight>
        )}
      </Flex>
    </Card>
  );
};

interface BorrowingCardProps {
  amount: number;
  name: string;
  escrow: anchor.web3.PublicKey;
  lender: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
  mint: anchor.web3.PublicKey;
  basisPoints: number;
  duration: number;
  startDate: number;
  uri: string;
}

const BorrowingCard: React.FC<BorrowingCardProps> = ({
  amount,
  name,
  basisPoints,
  duration,
  escrow,
  lender,
  listing,
  mint,
  startDate,
  uri,
}) => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const queryClient = useQueryClient();

  const mutation = useMutation(
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
      },
    }
  );

  return (
    <Card uri={uri}>
      <Typography>
        <Heading size="S">{name}</Heading>
        <Body size="S">
          Borrowing&nbsp;
          <strong>
            {amount / anchor.web3.LAMPORTS_PER_SOL}
            &nbsp;SOL
          </strong>
          &nbsp;for&nbsp;
          {utils.toMonths(duration)}
          &nbsp;months&nbsp;@&nbsp;
          <strong>{basisPoints / 100}%</strong>
          &nbsp;APR.&nbsp;
          <SpectrumLink>
            <a
              href={`https://explorer.solana.com/address/${mint}`}
              target="_blank"
              rel="noreferrer"
            >
              View in Explorer
            </a>
          </SpectrumLink>
        </Body>
      </Typography>
      <Divider size="S" marginTop="size-600" />
      <Flex direction="row" justifyContent="right">
        <Button
          marginY="size-200"
          variant="primary"
          onPress={() => mutation.mutate()}
        >
          Repay {utils.totalAmount(amount, startDate, basisPoints).toFixed(4)}
        </Button>
      </Flex>
    </Card>
  );
};

interface ListingCardProps {
  amount: number;
  basisPoints: number;
  duration: number;
  name: string;
  escrow: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
  mint: anchor.web3.PublicKey;
  uri: string;
}

const ListedCard: React.FC<ListingCardProps> = ({
  amount,
  basisPoints,
  duration,
  escrow,
  listing,
  mint,
  name,
  uri,
}) => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const queryClient = useQueryClient();

  const mutation = useMutation(
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

  return (
    <Card uri={uri}>
      <Typography>
        <Heading size="S">{name}</Heading>
        <Body size="S">
          Borrowing&nbsp;
          <strong>
            {amount / anchor.web3.LAMPORTS_PER_SOL}
            &nbsp;SOL
          </strong>
          &nbsp;for&nbsp;
          {utils.toMonths(duration)}
          &nbsp;months&nbsp;@&nbsp;
          <strong>{basisPoints / 100}%</strong>
          &nbsp;APR.&nbsp;
          <SpectrumLink>
            <a
              href={`https://explorer.solana.com/address/${mint}`}
              target="_blank"
              rel="noreferrer"
            >
              View in Explorer
            </a>
          </SpectrumLink>
        </Body>
      </Typography>
      <Divider size="S" marginTop="size-600" />
      <Flex direction="row" justifyContent="right">
        <Button
          marginY="size-200"
          variant="primary"
          onPress={() => mutation.mutate()}
        >
          Cancel
        </Button>
      </Flex>
    </Card>
  );
};

export default Manage;
