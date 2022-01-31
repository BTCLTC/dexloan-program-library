import {
  Flex,
  ProgressCircle as SpectrumProgressCircle,
} from "@adobe/react-spectrum";

export const ProgressCircle: React.FC = () => (
  <Flex
    direction="row"
    alignItems="center"
    justifyContent="center"
    width="100%"
    height="size-4600"
  >
    <SpectrumProgressCircle aria-label="Loading…" isIndeterminate />
  </Flex>
);
