import * as anchor from "@project-serum/anchor";
import {
  Button,
  ButtonGroup,
  Content,
  Dialog,
  DialogContainer,
  Divider,
  Heading as DialogHeading,
  Header,
  Flex,
  Text,
  View,
  ProgressCircle,
} from "@adobe/react-spectrum";

interface MutationDialogProps {
  open: boolean;
  header: React.ReactNode;
  content: React.ReactNode;
  loading: boolean;
  onConfirm: () => void;
  onRequestClose: () => void;
}

const MutationDialog: React.FC<MutationDialogProps> = ({
  open,
  header,
  content,
  loading,
  onConfirm,
  onRequestClose,
}) => {
  return (
    <DialogContainer onDismiss={onRequestClose}>
      {open && (
        <Dialog>
          <DialogHeading>Loan</DialogHeading>
          <Header>{header}</Header>
          <Content>
            {loading ? (
              <Flex direction="row" justifyContent="center" width="100%">
                <ProgressCircle
                  isIndeterminate
                  aria-label="Loading…"
                  marginY="size-200"
                />
              </Flex>
            ) : (
              <View>{content}</View>
            )}
          </Content>
          <Divider />
          <ButtonGroup>
            <Button
              isDisabled={loading}
              variant="secondary"
              onPress={onRequestClose}
            >
              Cancel
            </Button>
            <Button isDisabled={loading} variant="cta" onPress={onConfirm}>
              Confirm
            </Button>
          </ButtonGroup>
        </Dialog>
      )}
    </DialogContainer>
  );
};

interface LoanDialogProps {
  open: boolean;
  amount: number;
  basisPoints: number;
  loading: boolean;
  onConfirm: () => void;
  onRequestClose: () => void;
}

export const LoanDialog: React.FC<LoanDialogProps> = ({
  open,
  amount,
  basisPoints,
  loading,
  onConfirm,
  onRequestClose,
}) => {
  return (
    <MutationDialog
      open={open}
      loading={loading}
      header={
        amount &&
        basisPoints && (
          <>
            Lending&nbsp;
            <strong>{amount / anchor.web3.LAMPORTS_PER_SOL} SOL</strong>
            &nbsp;@&nbsp;
            <strong>{basisPoints / 100}% APY</strong>
          </>
        )
      }
      content={
        <Text>
          This loan may be repaid in full at any time. Interest will be
          calculated on a pro-rata basis. If the borrower fails to repay the
          loan before the expiry date, you may exercise the right to repossess
          the NFT.
        </Text>
      }
      onConfirm={onConfirm}
      onRequestClose={onRequestClose}
    />
  );
};

export const CancelDialog: React.FC<
  Pick<MutationDialogProps, "open" | "loading" | "onConfirm" | "onRequestClose">
> = ({ open, loading, onConfirm, onRequestClose }) => {
  return (
    <MutationDialog
      open={open}
      loading={loading}
      header={"Cancel Listing"}
      content={<Text>Do you wish to cancel this listing?</Text>}
      onConfirm={onConfirm}
      onRequestClose={onRequestClose}
    />
  );
};

export const RepayDialog: React.FC<
  Pick<MutationDialogProps, "open" | "loading" | "onConfirm" | "onRequestClose">
> = ({ open, loading, onConfirm, onRequestClose }) => {
  return (
    <MutationDialog
      open={open}
      loading={loading}
      header={"Repay Listing"}
      content={<Text>Repay listing?</Text>}
      onConfirm={onConfirm}
      onRequestClose={onRequestClose}
    />
  );
};

export const RepossessDialog: React.FC<
  Pick<MutationDialogProps, "open" | "loading" | "onConfirm" | "onRequestClose">
> = ({ open, loading, onConfirm, onRequestClose }) => {
  return (
    <MutationDialog
      open={open}
      loading={loading}
      header={"Repossess NFT"}
      content={
        <Text>
          Are you sure you wish to repossess the NFT collateral? By doing so the
          loan will default and you will not be able to receive for repayment.
        </Text>
      }
      onConfirm={onConfirm}
      onRequestClose={onRequestClose}
    />
  );
};

export const CloseAccountDialog: React.FC<
  Pick<MutationDialogProps, "open" | "loading" | "onConfirm" | "onRequestClose">
> = ({ open, loading, onConfirm, onRequestClose }) => {
  return (
    <MutationDialog
      open={open}
      loading={loading}
      header={"Close listing account"}
      content={<Text>Close listing account to recover rent?</Text>}
      onConfirm={onConfirm}
      onRequestClose={onRequestClose}
    />
  );
};
