import { Flex, View } from "@adobe/react-spectrum";

export const Main: React.FC = ({ children }) => {
  return (
    <View paddingY="size-600">
      <Flex direction="column" alignItems="center" margin="0 auto">
        <View paddingX="size-400" maxWidth="1200px" width="100%">
          {children}
        </View>
      </Flex>
    </View>
  );
};
