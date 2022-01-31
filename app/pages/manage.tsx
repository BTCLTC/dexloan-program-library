import * as anchor from "@project-serum/anchor";
import {
  Button,
  Divider,
  Flex,
  StatusLight,
  View,
} from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import * as utils from "../utils";
import { useLoansQuery, useBorrowingsQuery } from "../hooks/query";
import { ConnectWalletButton } from "../components/button";
import { Card, CardFlexContainer } from "../components/card";
import { ProgressCircle } from "../components/progress";
import { Typography, Body, Heading } from "../components/typography";
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
                  key={item?.loan.publicKey?.toBase58()}
                  amount={item.listing.amount.toNumber()}
                  basisPoints={item.listing.basisPoints}
                  duration={item.listing.duration}
                  name={item.metadata.data?.data?.name}
                  startDate={item.loan.account.startDate.toNumber()}
                  uri={item.metadata.data?.data?.uri}
                />
              )
          )}
        </CardFlexContainer>
        <View marginBottom="size-200" marginTop="size-600">
          <Divider size="M" />
          <Typography>
            <Heading>Your Borrowings</Heading>
          </Typography>
        </View>
        <CardFlexContainer>
          {borrowingsQueryResult.data?.map(
            (item) =>
              item && (
                <BorrowCard
                  key={item?.listing.publicKey?.toBase58()}
                  amount={item.listing.account.amount.toNumber()}
                  basisPoints={item.listing.account.basisPoints}
                  duration={item.listing.account.duration.toNumber()}
                  name={item.metadata.data?.data?.name}
                  startDate={Date.now() / 1000} // TODO get start date
                  uri={item.metadata.data?.data?.uri}
                />
              )
          )}
        </CardFlexContainer>
      </Main>
    </>
  );
};

interface LoanCardProps {
  amount: number;
  name: string;
  basisPoints: number;
  duration: number;
  startDate: number;
  uri: string;
}

const LoanCard: React.FC<LoanCardProps> = ({
  amount,
  name,
  basisPoints,
  duration,
  startDate,
  uri,
}) => {
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
          &nbsp;APY
        </Body>
      </Typography>
      <Divider size="S" marginTop="size-600" />
      <Flex direction="row" justifyContent="end">
        {utils.hasExpired(startDate, duration) ? (
          <Button marginY="size-200" variant="primary" onPress={() => {}}>
            Repossess
          </Button>
        ) : (
          <StatusLight marginY="size-200" marginX="size-50" variant="positive">
            {utils.yieldGenerated(amount, startDate, basisPoints)} SOL earned
          </StatusLight>
        )}
      </Flex>
    </Card>
  );
};

const BorrowCard: React.FC<LoanCardProps> = ({
  amount,
  name,
  basisPoints,
  duration,
  startDate,
  uri,
}) => {
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
          &nbsp;APY
        </Body>
      </Typography>
      <Divider size="S" marginTop="size-600" />
      <Flex direction="row" justifyContent="right">
        <Button marginY="size-200" variant="primary" onPress={() => {}}>
          Repay
        </Button>
      </Flex>
    </Card>
  );
};

export default Manage;
