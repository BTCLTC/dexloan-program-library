import { Flex, Image, View, ProgressCircle } from "@adobe/react-spectrum";

import { useMetadataFileQuery } from "../../hooks/query";

interface ListingImageProps {
  uri: string | undefined;
}

export const ListingImage: React.FC<ListingImageProps> = ({ uri }) => {
  const metadataFileQuery = useMetadataFileQuery(uri);

  return (
    <View
      flex={1}
      minWidth={320}
      maxWidth={475}
      maxHeight={475}
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
