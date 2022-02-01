import { Flex, ProgressCircle } from "@adobe/react-spectrum";

export const LoadingPlaceholder: React.FC = () => (
  <Flex
    direction="row"
    alignItems="center"
    justifyContent="center"
    width="100%"
    height="size-4600"
  >
    <ProgressCircle aria-label="Loading…" isIndeterminate />
  </Flex>
);
