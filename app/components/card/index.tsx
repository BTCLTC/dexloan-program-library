import { Flex, Image, View } from "@adobe/react-spectrum";
import React, { useEffect, useState, useRef } from "react";
import { useMetadataFileQuery } from "../../hooks/query";

interface CardProps {
  elementType?: React.JSXElementConstructor<any>;
  uri: string;
}

export const Card: React.FC<CardProps> = ({ elementType, children, uri }) => {
  const [isVisible, setVisible] = useState(false);
  const markerElementRef = useRef<HTMLSpanElement>(null);
  const metadataFileQuery = useMetadataFileQuery(uri);

  useEffect(() => {
    function callback([entry]: IntersectionObserverEntry[]) {
      if (entry.isIntersecting) {
        setVisible(true);
      }
    }

    const el = markerElementRef.current;
    const observer = new IntersectionObserver(callback, {
      root: null,
      rootMargin: "0px",
      threshold: 0.75,
    });

    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, []);

  return (
    <View
      elementType={elementType}
      borderRadius="regular"
      borderColor="default"
      borderWidth="thin"
      width="size-4600"
      overflow="hidden"
    >
      {metadataFileQuery.data?.image && isVisible ? (
        <Image
          alt="NFT"
          src={metadataFileQuery.data.image}
          objectFit="cover"
          width="100%"
          height="size-1600"
        />
      ) : (
        <View
          width="100%"
          height="size-1600"
          backgroundColor="static-gray-900"
        />
      )}
      <View paddingX="size-100">
        {children} <span ref={markerElementRef} />
      </View>
    </View>
  );
};

export const CardFlexContainer: React.FC = ({ children }) => {
  return (
    <Flex direction="row" gap="size-200" wrap="wrap" justifyContent="start">
      {children}
    </Flex>
  );
};
