import { Image, Flex } from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useNFTByOwnerQuery, useMetadataFileQuery } from "../../hooks/query";
import { Heading, Typography } from "../../components/typography";

const BorrowPubkey: NextPage = () => {
  const router = useRouter();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const queryResult = useNFTByOwnerQuery(connection, anchorWallet?.publicKey);

  const pubkey = router.query.pubkey as string;
  const nft = queryResult.data?.find(
    (nft) => nft.accountInfo.pubkey?.toBase58() === pubkey
  );

  const metadataFileQuery = useMetadataFileQuery(nft?.metadata.data?.data?.uri);

  return (
    <Flex direction="column" width="100%">
      <Image alt="NFT" src={metadataFileQuery.data?.image} width="size-6000" />
      <Typography>
        <Heading>{nft?.metadata.data?.data?.name}</Heading>
      </Typography>
    </Flex>
  );
};

export default BorrowPubkey;
