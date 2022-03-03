import * as anchor from "@project-serum/anchor";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import {
  Flex,
  Image,
  View,
  Link as SpectrumLink,
  ProgressCircle,
} from "@adobe/react-spectrum";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import * as utils from "../../utils";
import { useListingQuery, useMetadataFileQuery } from "../../hooks/query";
import { Body, Heading, Typography } from "../../components/typography";
import { LoadingPlaceholder } from "../../components/progress";
import { Main } from "../../components/layout";

const Listing: NextPage = () => {
  const router = useRouter();
  const { listingId } = router.query;
  const { connection } = useConnection();

  console.log("listingId: ", listingId);

  const pubkey = listingId
    ? new anchor.web3.PublicKey(listingId as string)
    : undefined;
  const listingQuery = useListingQuery(connection, pubkey);

  if (listingQuery.isLoading) {
    return <LoadingPlaceholder />;
  }

  const listing = listingQuery.data?.listing;
  const metadata = listingQuery.data?.metadata;
  console.log(metadata);
  return (
    <Main>
      <Flex direction="row">
        <Flex flex={1} direction="column" justifyContent="center">
          <View padding="size-100">
            <ListingImage uri={metadata?.data.data.uri} />
          </View>
        </Flex>
        <Flex flex={1} direction="column">
          <View padding="size-100">
            <View paddingBottom="size-100">
              <Heading size="L">{metadata?.data.data.name}</Heading>
            </View>
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
              <SpectrumLink>
                <a
                  href={`https://explorer.solana.com/address/${listing?.mint.toBase58()}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View in Explorer
                </a>
              </SpectrumLink>
            </Body>
          </View>
        </Flex>
      </Flex>
    </Main>
  );
};

interface ListingImageProps {
  uri: string | undefined;
}

const ListingImage: React.FC<ListingImageProps> = ({ uri }) => {
  const metadataFileQuery = useMetadataFileQuery(uri);

  return (
    <View
      flex={1}
      maxWidth={568}
      maxHeight={568}
      borderRadius="large"
      overflow="hidden"
    >
      {metadataFileQuery.data?.image ? (
        <Image
          height="100%"
          width="100%"
          src={metadataFileQuery.data?.image}
          alt="NFT"
        />
      ) : (
        <Flex
          height={568}
          width={568}
          alignItems="center"
          justifyContent="center"
        >
          <ProgressCircle aria-label="Loading…" isIndeterminate />
        </Flex>
      )}
    </View>
  );
};

export default Listing;
