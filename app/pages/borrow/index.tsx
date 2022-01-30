import { Flex } from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import Link from "next/link";
import { useNFTByOwnerQuery } from "../../hooks/query";
import { Card } from "../../components/card";
import { ProgressCircle } from "../../components/progress";
import { Typography, Body } from "../../components/typography";

const Borrow: NextPage = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const queryResult = useNFTByOwnerQuery(connection, anchorWallet?.publicKey);

  if (queryResult.isLoading) {
    return <ProgressCircle />;
  }

  return (
    <Flex direction="row" width="100%" gap="size-100" wrap="wrap">
      {queryResult.data?.map((nft) => (
        <Card
          key={nft.accountInfo.pubkey?.toBase58()}
          uri={nft.metadata.data?.data?.uri}
          elementType={(props) => (
            <Link href={`/borrow/${nft.accountInfo.pubkey?.toBase58()}`}>
              <a {...props} />
            </Link>
          )}
        >
          <Typography>
            <Body>
              <strong>{nft.metadata.data?.data?.name}</strong>
            </Body>
          </Typography>
        </Card>
      ))}
    </Flex>
  );
};

export default Borrow;
