import * as anchor from "@project-serum/anchor";
import { Flex, Image, Text } from "@adobe/react-spectrum";
import { useQuery } from "react-query";

interface CardProps {
  mint: anchor.web3.PublicKey;
  name: string;
  uri: string;
}

export const Card: React.FC<CardProps> = ({ children, name, mint, uri }) => {
  const metadataFileQuery = useQuery(
    ["nft", mint?.toBase58()],
    () => {
      return fetch(uri).then((response) => {
        return response.json().then((data) => data);
      });
    },
    {
      enabled: Boolean(uri),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );

  return (
    <Flex direction="column" flex={1} width={{ base: "50%", M: "33.333%" }}>
      <Image
        alt={name}
        src={metadataFileQuery.data?.image}
        objectFit="cover"
        width="100%"
        UNSAFE_style={{ aspectRatio: "1" }}
      />
      <Text>{name}</Text>
      <Text>{mint.toBase58()}</Text>
      <Text>{uri}</Text>
    </Flex>
  );
};
