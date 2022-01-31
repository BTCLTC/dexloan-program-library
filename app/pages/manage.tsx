import * as anchor from "@project-serum/anchor";
import { Divider, Flex, StatusLight, View } from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import * as api from "../lib/api";
import { useLoansQuery, useBorrowingsQuery } from "../hooks/query";
import { ConnectWalletButton } from "../components/button";
import { Card, CardFlexContainer } from "../components/card";
import { ProgressCircle } from "../components/progress";
import { Typography, Detail, Body, Heading } from "../components/typography";
import { Main } from "../components/layout";

const Manage: NextPage = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const loansQueryResult = useLoansQuery(connection, anchorWallet);
  const borrowingsQueryResult = useBorrowingsQuery(connection, anchorWallet);

  if (!anchorWallet) {
    return (
      <Flex direction="row" justifyContent="center">
        <View marginY="size-2000">
          <ConnectWalletButton />
        </View>
      </Flex>
    );
  }

  if (loansQueryResult.isLoading || borrowingsQueryResult.isLoading) {
    return <ProgressCircle />;
  }

  return (
    <>
      <Main>
        <Flex>
          <Typography>
            <Heading>Your Loans</Heading>
          </Typography>
        </Flex>
        <CardFlexContainer>
          {loansQueryResult.data?.map(
            (item) =>
              item && (
                <Card
                  key={item?.loan.publicKey?.toBase58()}
                  uri={item.metadata.data?.data?.uri}
                >
                  <Typography>
                    <Body>
                      <strong>{item.metadata.data?.data?.name}</strong>
                    </Body>
                    <Detail>
                      {item.listing.amount.toNumber() /
                        anchor.web3.LAMPORTS_PER_SOL}
                      &nbsp;SOL&nbsp;@&nbsp;
                      {item.listing.basisPoints / 100}%
                    </Detail>
                  </Typography>
                  <Divider size="M" />
                  <Flex direction="row" justifyContent="end">
                    {item.listing.state === api.ListingState.Active ? (
                      <StatusLight variant="positive">Active</StatusLight>
                    ) : (
                      <StatusLight variant="yellow">Overdue</StatusLight>
                    )}
                  </Flex>
                </Card>
              )
          )}
        </CardFlexContainer>
        <Flex>
          <Typography>
            <Heading>Your Borrowings</Heading>
          </Typography>
        </Flex>
        <CardFlexContainer>
          {borrowingsQueryResult.data?.map(
            (item) =>
              item && (
                <Card
                  key={item?.listing.publicKey?.toBase58()}
                  uri={item.metadata.data?.data?.uri}
                >
                  <Typography>
                    <Heading size="M">{item.metadata.data?.data?.name}</Heading>
                    <Heading size="S">
                      {item.listing.account.amount.toNumber() /
                        anchor.web3.LAMPORTS_PER_SOL}
                      SOL
                    </Heading>
                    <Body>
                      Lend for upto
                      {item.listing.account.duration.toNumber() *
                        60 *
                        24 *
                        24 *
                        30}
                      &nbsp;months @&nbsp;
                      <strong>
                        {item.listing.account.basisPoints / 100}APY
                      </strong>
                    </Body>
                  </Typography>
                  <Divider size="M" />
                  <Flex direction="row" justifyContent="end">
                    {item.listing.account.state === api.ListingState.Active ? (
                      <StatusLight variant="positive">Active</StatusLight>
                    ) : (
                      <StatusLight variant="yellow">Overdue</StatusLight>
                    )}
                  </Flex>
                </Card>
              )
          )}
        </CardFlexContainer>
      </Main>
    </>
  );
};

export default Manage;
