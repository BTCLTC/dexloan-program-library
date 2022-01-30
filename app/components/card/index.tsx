import { Image, View } from "@adobe/react-spectrum";
import React from "react";
import { useMetadataFileQuery } from "../../hooks/query";

interface CardProps {
  elementType?: React.JSXElementConstructor<any>;
  uri: string;
}

export const Card: React.FC<CardProps> = ({ elementType, children, uri }) => {
  const metadataFileQuery = useMetadataFileQuery(uri);

  return (
    <View
      elementType={elementType}
      borderRadius="medium"
      borderColor="default"
      borderWidth="thin"
      width="size-3000"
      overflow="hidden"
    >
      <Image
        alt="NFT"
        src={metadataFileQuery.data?.image}
        objectFit="cover"
        width="100%"
        UNSAFE_style={{ aspectRatio: "1" }}
      />
      <View paddingX="size-100">{children}</View>
    </View>
  );
};
