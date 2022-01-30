import { Button, Divider, Flex, View } from "@adobe/react-spectrum";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletName } from "@solana/wallet-adapter-wallets";
import type { NextPage } from "next";
import Link from "next/link";
import { useNFTByOwnerQuery } from "../../hooks/query";
import { Card } from "../../components/card";
import { ProgressCircle } from "../../components/progress";
import { Typography, Heading } from "../../components/typography";

const Borrow: NextPage = () => {
  const { connection } = useConnection();
  const wallet = useWallet();

  const queryResult = useNFTByOwnerQuery(connection, wallet?.publicKey);
  console.log("queryResult", queryResult);

  if (!wallet.connected) {
    return (
      <Flex direction="row" justifyContent="center">
        <Button
          margin="size-600"
          variant="cta"
          onPress={async () => {
            try {
              wallet.select(PhantomWalletName);
              await wallet.connect();
            } catch {}
          }}
        >
          Connect Wallet
        </Button>
      </Flex>
    );
  }

  if (queryResult.isLoading) {
    return <ProgressCircle />;
  }

  return (
    <View paddingY="size-600">
      <Flex direction="column" alignItems="center" margin="0 auto">
        <View paddingX="size-400" maxWidth="1200px">
          <Flex direction="row" gap="size-200" wrap="wrap">
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
                <View>
                  <Typography>
                    <Heading size="S">{nft.metadata.data?.data?.name}</Heading>
                  </Typography>
                </View>
                <Divider size="S" marginTop="size-600" />
              </Card>
            ))}
          </Flex>
        </View>
      </Flex>
    </View>
  );
};

export default Borrow;
