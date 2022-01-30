import { Flex } from "@adobe/react-spectrum";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import type { NextPage } from "next";
import { useListingsQuery } from "../../hooks/query";
import { Card } from "../../components/card";
import { ProgressCircle } from "../../components/progress";

const Lend: NextPage = () => {
  const { connection } = useConnection();

  const queryResult = useListingsQuery(connection);

  if (queryResult.isLoading) {
    return <ProgressCircle />;
  }

  return (
    <Flex direction="row" width="100%" gap="size-100" wrap="wrap">
      {queryResult.data?.map(
        (item) =>
          item && (
            <Card
              key={item?.listing.publicKey?.toBase58()}
              pubkey={item.listing.publicKey}
              name={item.metadata.data?.data?.name}
              uri={item.metadata.data?.data?.uri}
            />
          )
      )}
    </Flex>
  );
};

export default Lend;
