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
  Text,
  View,
  Link as SpectrumLink,
  ProgressCircle,
} from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import { useMutation, useQueryClient } from "react-query";
import { toast } from "react-toastify";
import * as utils from "../utils";
import * as api from "../lib/api";
import { useListingsQuery } from "../hooks/query";
import { useWalletConnect } from "../components/button";
import { Card, CardFlexContainer } from "../components/card";
import { LoadingPlaceholder } from "../components/progress";
import { Body, Heading, Typography } from "../components/typography";
import { Main } from "../components/layout";

const Listings: NextPage = () => {
  const router = useRouter();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [handleConnect] = useWalletConnect();
  const queryClient = useQueryClient();
  const queryResult = useListingsQuery(connection);

  const [selectedListing, setDialog] = useState<{
    publicKey: anchor.web3.PublicKey;
    account: {
      amount: anchor.BN;
      basisPoints: number;
      borrower: anchor.web3.PublicKey;
      duration: anchor.BN;
      escrow: anchor.web3.PublicKey;
      mint: anchor.web3.PublicKey;
      state: number;
    };
  } | null>(null);

  const mutation = useMutation(
    () => {
      if (anchorWallet && selectedListing) {
        return api.createLoan(
          connection,
          anchorWallet,
          selectedListing.account.mint,
          selectedListing.account.borrower,
          selectedListing.publicKey
        );
      }
      throw new Error("Not ready");
    },
    {
      onSuccess() {
        queryClient.invalidateQueries([
          "loans",
          anchorWallet?.publicKey.toBase58(),
        ]);

        setDialog(null);

        router.push("/manage");
      },
      onError(err) {
        console.error(err);
        if (err instanceof Error) {
          toast.error("Error: " + err.message);
        }
      },
    }
  );

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
                        &nbsp;APY.{" "}
                        <SpectrumLink>
                          <a
                            href={`https://explorer.solana.com/address/${item.listing.account.mint.toBase58()}?cluster=devnet`}
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
      <DialogContainer onDismiss={() => setDialog(null)}>
        {selectedListing && (
          <Dialog>
            <DialogHeading>Loan</DialogHeading>
            <Header>
              Lending&nbsp;
              <strong>
                {selectedListing.account.amount.toNumber() /
                  anchor.web3.LAMPORTS_PER_SOL}{" "}
                SOL
              </strong>
              &nbsp;@&nbsp;
              <strong>{selectedListing.account.basisPoints / 100}% APY</strong>
            </Header>
            <Content>
              {mutation.isLoading ? (
                <Flex direction="row" justifyContent="center" width="100%">
                  <ProgressCircle
                    isIndeterminate
                    aria-label="Loading…"
                    marginY="size-200"
                  />
                </Flex>
              ) : (
                <View>
                  <Text>
                    This loan may be repaid in full at any time. Interest will
                    be calulated on a pro-rata basis. If the borrower fails to
                    repay the loan before the expiry date, you may exercise the
                    right to repossess the NFT.
                  </Text>
                </View>
              )}
            </Content>
            <Divider />
            <ButtonGroup>
              <Button
                isDisabled={mutation.isLoading}
                variant="secondary"
                onPress={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                isDisabled={mutation.isLoading}
                variant="cta"
                onPress={() => mutation.mutate()}
              >
                Confirm
              </Button>
            </ButtonGroup>
          </Dialog>
        )}
      </DialogContainer>
    </>
  );
};

export default Listings;
