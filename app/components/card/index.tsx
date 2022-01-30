import * as anchor from "@project-serum/anchor";
import { Image, View } from "@adobe/react-spectrum";
import Link from "next/link";
import React from "react";
import { useMetadataFileQuery } from "../../hooks/query";
import { Body, Typography } from "../typography";

interface CardProps {
  pubkey: anchor.web3.PublicKey;
  name: string;
  uri: string;
}

export const Card: React.FC<CardProps> = ({ pubkey, name, uri }) => {
  const metadataFileQuery = useMetadataFileQuery(uri);

  return (
    <View
      elementType={(props) => (
        <Link href={`/borrow/${pubkey.toBase58()}`}>
          <a {...props} />
        </Link>
      )}
      borderRadius="medium"
      borderColor="default"
      borderWidth="thin"
      width="size-2000"
      overflow="hidden"
    >
      <Image
        alt={metadataFileQuery.data?.name}
        src={metadataFileQuery.data?.image}
        objectFit="cover"
        width="100%"
        UNSAFE_style={{ aspectRatio: "1" }}
      />
      <View paddingX="size-100">
        <Typography>
          <Body>
            <strong>{name}</strong>
          </Body>
        </Typography>
      </View>
    </View>
  );
};
