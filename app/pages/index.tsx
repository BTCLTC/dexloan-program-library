import * as anchor from "@project-serum/anchor";
import { Button, Divider, Flex } from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import type { Listing } from "../types";
import * as utils from "../utils";
import { useListingsQuery } from "../hooks/query";
import { useWalletConnect } from "../components/button";
import { Card, CardFlexContainer } from "../components/card";
import { LoadingPlaceholder } from "../components/progress";
import { Body, Heading, Typography } from "../components/typography";
import { Main } from "../components/layout";
import { LoanDialog } from "../components/dialog";
import { useLoanMutation } from "../hooks/mutation";

const Listings: NextPage = () => {
  const router = useRouter();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [handleConnect] = useWalletConnect();
  const queryResult = useListingsQuery(connection);

  const [selectedListing, setDialog] = useState<Listing | null>(null);
  const mutation = useLoanMutation(() => setDialog(null));

  async function onCreateLoan(item: any) {
    if (anchorWallet) {
      setDialog(item.listing);
    } else {
      handleConnect(() => setDialog(item.listing));
    }
  }

  return (
    <>
      {queryResult.isLoading ? (
        <LoadingPlaceholder />
      ) : (
        <Main>
          <CardFlexContainer>
            {queryResult.data?.map(
              (item) =>
                item && (
                  <Card
                    key={item?.listing.publicKey?.toBase58()}
                    uri={item.metadata.data?.data?.uri}
                  >
                    <Typography>
                      <Heading size="S">
                        {item.metadata.data?.data?.name}
                      </Heading>
                      <Body size="S">
                        Lend&nbsp;
                        {item.listing.account.amount.toNumber() /
                          anchor.web3.LAMPORTS_PER_SOL}
                        &nbsp;SOL for upto&nbsp;
                        <strong>
                          {utils.toMonths(
                            item.listing.account.duration.toNumber()
                          )}
                          &nbsp;months @&nbsp;
                        </strong>
                        <strong>
                          {item.listing.account.basisPoints / 100}%
                        </strong>
                        &nbsp;APY.
                      </Body>
                    </Typography>
                    <Divider size="S" marginTop="size-600" />
                    <Flex direction="row" justifyContent="end">
                      <Button
                        variant="secondary"
                        marginY="size-200"
                        marginEnd="size-100"
                        onPress={() =>
                          router.push(
                            `/listing/${item.listing.publicKey.toBase58()}`
                          )
                        }
                      >
                        View
                      </Button>
                      <Button
                        variant="cta"
                        marginY="size-200"
                        onPress={() => onCreateLoan(item)}
                      >
                        Lend
                      </Button>
                    </Flex>
                  </Card>
                )
            )}
          </CardFlexContainer>
        </Main>
      )}

      <LoanDialog
        open={Boolean(selectedListing)}
        amount={selectedListing?.account.amount.toNumber() ?? 0}
        basisPoints={selectedListing?.account.basisPoints ?? 0}
        loading={mutation.isLoading}
        onRequestClose={() => setDialog(null)}
        onConfirm={() => {
          if (selectedListing) {
            mutation.mutate({
              mint: selectedListing.account.mint,
              borrower: selectedListing.account.borrower,
              listing: selectedListing.publicKey,
            });
          }
        }}
      />
    </>
  );
};

export default Listings;
