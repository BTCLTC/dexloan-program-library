import * as anchor from "@project-serum/anchor";
import {
  Button,
  ButtonGroup,
  Content,
  Dialog,
  DialogContainer,
  Divider,
  Heading as DialogHeading,
  Header,
  Flex,
  StatusLight,
  Text,
  View,
} from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useState } from "react";
import { useMutation } from "react-query";
import * as api from "../lib/api";
import {
  useListingsQuery,
  useLoansQuery,
  useBorrowingsQuery,
} from "../hooks/query";
import { Card } from "../components/card";
import { ProgressCircle } from "../components/progress";
import { Typography, Detail, Body, Heading } from "../components/typography";

const Manage: NextPage = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const loansQueryResult = useLoansQuery(connection, anchorWallet);
  const borrowingsQueryResult = useBorrowingsQuery(connection, anchorWallet);

  if (loansQueryResult.isLoading) {
    return <ProgressCircle />;
  }

  return (
    <>
      <Flex>
        <Typography>
          <Heading>Your loans</Heading>
        </Typography>
      </Flex>
      <Flex direction="row" width="100%" gap="size-100" wrap="wrap">
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
      </Flex>
      <Flex>
        <Typography>
          <Heading>Your Borrowings</Heading>
        </Typography>
      </Flex>
      <Flex direction="row" width="100%" gap="size-100" wrap="wrap">
        {borrowingsQueryResult.data?.map(
          (item) =>
            item && (
              <Card
                key={item?.listing.publicKey?.toBase58()}
                uri={item.metadata.data?.data?.uri}
              >
                <Typography>
                  <Body>
                    <strong>{item.metadata.data?.data?.name}</strong>
                  </Body>
                  <Detail>
                    {item.listing.account.amount.toNumber() /
                      anchor.web3.LAMPORTS_PER_SOL}
                    &nbsp;SOL&nbsp;@&nbsp;
                    {item.listing.account.basisPoints / 100}%
                  </Detail>
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
      </Flex>
    </>
  );
};

export default Manage;
