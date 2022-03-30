import * as anchor from "@project-serum/anchor";
import {
  Button,
  ButtonGroup,
  Content,
  Dialog,
  DialogContainer,
  Divider,
  Heading as DialogHeading,
  Image,
  Flex,
  Form,
  NumberField,
  View,
  ProgressCircle,
} from "@adobe/react-spectrum";
import {
  useConnection,
  useWallet,
  useAnchorWallet,
} from "@solana/wallet-adapter-react";
import BigDecimal from "js-big-decimal";
import type { NextPage } from "next";
import { useState } from "react";
import { useMutation, useQueryClient } from "react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "react-toastify";
import * as web3 from "../lib/web3";
import {
  getNFTByOwnerQueryKey,
  useNFTByOwnerQuery,
  useMetadataFileQuery,
  NFTResult,
} from "../hooks/query";
import { Card, CardFlexContainer } from "../components/card";
import { LoadingPlaceholder } from "../components/progress";
import { Typography, Heading } from "../components/typography";
import { Main } from "../components/layout";
import { ConnectWalletButton } from "../components/button";

const Borrow: NextPage = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();

  const [selected, setDialog] = useState<NFTResult | null>(null);
  const queryResult = useNFTByOwnerQuery(connection, anchorWallet);

  if (!wallet.connected) {
    return (
      <Flex direction="row" justifyContent="center">
        <View marginY="size-2000">
          <ConnectWalletButton />
        </View>
      </Flex>
    );
  }

  return (
    <>
      {queryResult.isLoading ? (
        <LoadingPlaceholder />
      ) : (
        <Main>
          <CardFlexContainer>
            {queryResult.data?.map((nft) => (
              <Card
                key={nft.accountInfo.pubkey?.toBase58()}
                uri={nft.metadata.data?.data?.uri}
              >
                <View paddingX="size-200">
                  <Typography>
                    <Heading size="S">{nft.metadata.data?.data?.name}</Heading>
                  </Typography>
                  <Divider size="S" marginTop="size-600" />
                  <Flex direction="row" justifyContent="right">
                    <Button
                      marginY="size-200"
                      variant="cta"
                      onPress={() => setDialog(nft)}
                    >
                      List
                    </Button>
                  </Flex>
                </View>
              </Card>
            ))}
          </CardFlexContainer>
        </Main>
      )}
      <BorrowDialog nft={selected} setDialog={setDialog} />
    </>
  );
};

interface FormFields {
  amountSOL: number;
  returnAPY: number;
  durationMonths: number;
}

interface BorrowDialogProps {
  nft: NFTResult | null;
  setDialog: (nft: NFTResult | null) => void;
}

const BorrowDialog: React.FC<BorrowDialogProps> = ({ nft, setDialog }) => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const queryClient = useQueryClient();

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
          basisPoints: parseInt(
            new BigDecimal(variables.returnAPY)
              .multiply(new BigDecimal("10000"))
              .getValue()
          ),
          duration: variables.durationMonths * 30 * 24 * 60 * 60,
        };

        return web3.createListing(
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
        if (err instanceof Error) {
          toast.error("Error: " + err.message);
        }
      },
      onSuccess() {
        toast.success("Listing created");

        queryClient.setQueryData<NFTResult[]>(
          ["wallet-nfts", anchorWallet?.publicKey.toBase58()],
          (data) => {
            if (!data) {
              return [];
            }
            return data.filter(
              (item: NFTResult) =>
                item?.accountInfo.pubkey !== nft?.accountInfo.pubkey
            );
          }
        );

        setDialog(null);
      },
    }
  );

  const { control, handleSubmit } = useForm<FormFields>({
    mode: "onChange",
  });

  function onSubmit() {
    handleSubmit((data) => mutation.mutate(data))();
  }

  const listingForm = (
    <Form>
      <Controller
        control={control}
        name="amountSOL"
        rules={{
          required: true,
        }}
        render={({ field: { ref, onChange }, fieldState: { error } }) => (
          <NumberField
            label="Amount"
            minValue={0.1}
            formatOptions={{
              currency: "SOL",
            }}
            validationState={error ? "invalid" : undefined}
            ref={ref}
            onChange={onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="returnAPY"
        rules={{ required: true }}
        render={({ field: { ref, onChange }, fieldState: { error } }) => (
          <NumberField
            label="APY"
            formatOptions={{
              maximumFractionDigits: 1,
              style: "percent",
            }}
            minValue={0.05}
            ref={ref}
            validationState={error ? "invalid" : undefined}
            onChange={onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="durationMonths"
        rules={{ required: true }}
        render={({ field: { ref, onChange }, fieldState: { error } }) => (
          <NumberField
            label="Duration (months)"
            minValue={1}
            maxValue={24}
            step={1}
            ref={ref}
            validationState={error ? "invalid" : undefined}
            onChange={onChange}
          />
        )}
      />
    </Form>
  );

  return (
    <DialogContainer onDismiss={() => setDialog(null)}>
      {nft && (
        <Dialog>
          <Image
            slot="hero"
            alt="NFT"
            src={metadataFileQuery.data?.image}
            objectFit="cover"
          />
          <DialogHeading>Create Listing</DialogHeading>
          <Divider />
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
              listingForm
            )}
          </Content>
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
              onPress={onSubmit}
            >
              Submit
            </Button>
          </ButtonGroup>
        </Dialog>
      )}
    </DialogContainer>
  );
};

export default Borrow;
