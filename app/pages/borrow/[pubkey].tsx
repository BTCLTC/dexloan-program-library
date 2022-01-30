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
  Image,
  Flex,
  Form,
  NumberField,
  Text,
  View,
} from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useState } from "react";
import { useRouter } from "next/router";
import { useForm, Controller } from "react-hook-form";
import { useMutation } from "react-query";
import * as api from "../../lib/api";
import { useNFTByOwnerQuery, useMetadataFileQuery } from "../../hooks/query";
import { Heading, Typography } from "../../components/typography";
import { ProgressCircle } from "../../components/progress";

interface FormFields {
  amountSOL: number;
  returnAPY: number;
  durationMonths: number;
}

const BorrowPubkey: NextPage = () => {
  const router = useRouter();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const form = useForm<FormFields>();

  const queryResult = useNFTByOwnerQuery(connection, anchorWallet?.publicKey);

  const pubkey = router.query.pubkey as string;
  const nft = queryResult.data?.find(
    (nft) => nft.accountInfo.pubkey?.toBase58() === pubkey
  );

  const metadataFileQuery = useMetadataFileQuery(nft?.metadata.data?.data?.uri);

  const mutation = useMutation(
    (variables: FormFields) => {
      if (
        anchorWallet &&
        nft?.accountInfo.data.mint &&
        nft?.accountInfo.pubkey
      ) {
        const listingOptions = {
          amount: variables.amountSOL * anchor.web3.LAMPORTS_PER_SOL,
          basisPoints: variables.returnAPY * 100,
          duration: variables.durationMonths * 30 * 24 * 60 * 60,
        };

        return api.createListing(
          connection,
          anchorWallet,
          nft.accountInfo.data.mint,
          nft.accountInfo.pubkey,
          listingOptions
        );
      }
      throw new Error("Not ready");
    },
    {
      onError(err) {
        console.error("Error: " + err);
      },
      onSuccess() {
        router.push("/borrow");
      },
    }
  );

  const [showDialog, setDialog] = useState(false);

  if (queryResult.isLoading || metadataFileQuery.isLoading) {
    return <ProgressCircle />;
  }

  return (
    <>
      <Flex direction="row" width="100%">
        <View padding="size-200">
          <Image
            alt="NFT"
            src={metadataFileQuery.data?.image}
            width="size-5000"
          />
        </View>
        <View padding="size-200">
          <Typography>
            <Heading>{nft?.metadata.data?.data?.name}</Heading>
          </Typography>
          <Form
            maxWidth="size-3600"
            validationState="invalid"
            onSubmit={form.handleSubmit(() => setDialog(true))}
          >
            <Controller
              control={form.control}
              name="amountSOL"
              rules={{ required: true }}
              render={({ field: { onChange }, fieldState: { invalid } }) => (
                <NumberField
                  label="Amount"
                  minValue={1}
                  maxValue={24}
                  formatOptions={{
                    currency: "SOL",
                  }}
                  validationState={invalid ? "invalid" : undefined}
                  onChange={onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="returnAPY"
              rules={{ required: true }}
              render={({ field: { onChange }, fieldState: { invalid } }) => (
                <NumberField
                  label="APY"
                  formatOptions={{
                    maximumFractionDigits: 1,
                    style: "percent",
                  }}
                  minValue={0.01}
                  maxValue={6.5}
                  validationState={invalid ? "invalid" : undefined}
                  onChange={onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="durationMonths"
              rules={{ required: true }}
              render={({ field: { onChange }, fieldState: { invalid } }) => (
                <NumberField
                  label="Duration (months)"
                  minValue={1}
                  maxValue={24}
                  step={1}
                  validationState={invalid ? "invalid" : undefined}
                  onChange={onChange}
                />
              )}
            />
            <Button variant="cta" type="submit" marginY="size-300">
              Create Listing
            </Button>
          </Form>
        </View>
      </Flex>
      <DialogContainer onDismiss={() => setDialog(false)}>
        {showDialog && (
          <Dialog>
            <DialogHeading>Create Listing</DialogHeading>
            <Header>
              Borrowing {form.getValues().amountSOL} SOL @{" "}
              {form.getValues().returnAPY * 100}% APY
            </Header>
            <Content>
              <View>
                <Text>
                  You may cancel your listing at any time before the loan
                  becomes active. After {form.getValues().durationMonths} months
                  your required repayment will be{" "}
                  <strong>
                    {(form.getValues().returnAPY / 12) *
                      form.getValues().durationMonths *
                      form.getValues().amountSOL +
                      form.getValues().amountSOL}{" "}
                    SOL
                  </strong>
                  . Failure to repay your loan may result in the loss of your
                  NFT.
                </Text>
              </View>
            </Content>
            <Divider />
            <ButtonGroup>
              <Button
                isDisabled={mutation.isLoading}
                variant="secondary"
                onPress={() => setDialog(false)}
              >
                Cancel
              </Button>
              <Button
                isDisabled={mutation.isLoading}
                variant="cta"
                onPress={() => mutation.mutate(form.getValues())}
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

export default BorrowPubkey;
