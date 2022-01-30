import {
  Flex,
  ProgressCircle as SpectrumProgressCircle,
} from "@adobe/react-spectrum";

export const ProgressCircle: React.FC = () => (
  <Flex alignItems="center" justifyContent="center" height="100%" width="100%">
    <SpectrumProgressCircle aria-label="Loading…" isIndeterminate />
  </Flex>
);
