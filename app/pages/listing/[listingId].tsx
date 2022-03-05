import * as anchor from "@project-serum/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Button,
  Divider,
  Flex,
  Image,
  View,
  Link as SpectrumLink,
  ProgressCircle,
} from "@adobe/react-spectrum";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import * as utils from "../../utils";
import { ListingState } from "../../lib/web3";
import { useListingQuery, useMetadataFileQuery } from "../../hooks/query";
import {
  useCancelMutation,
  useLoanMutation,
  useRepaymentMutation,
  useRepossessMutation,
} from "../../hooks/mutation";
import { Body, Heading } from "../../components/typography";
import { LoadingPlaceholder } from "../../components/progress";
import { Main } from "../../components/layout";
import {
  CancelDialog,
  LoanDialog,
  RepayDialog,
  RepossessDialog,
} from "../../components/dialog";

const Listing: NextPage = () => {
  const router = useRouter();
  const { listingId } = router.query;
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();

  const pubkey = listingId
    ? new anchor.web3.PublicKey(listingId as string)
    : undefined;
  const listingQuery = useListingQuery(connection, pubkey);

  if (listingQuery.isLoading) {
    return <LoadingPlaceholder />;
  }

  const listing = listingQuery.data?.listing;
  const metadata = listingQuery.data?.metadata;

  const hasExpired =
    listing &&
    utils.hasExpired(listing.startDate.toNumber(), listing.duration.toNumber());

  function getRepaymentText() {
    if (listing) {
      if (hasExpired) {
        return (
          <>
            is <strong>overdue</strong>.
          </>
        );
      }

      return (
        <>
          due by{" "}
          <strong>
            {utils.getFormattedDueDate(
              listing.startDate.toNumber(),
              listing.duration.toNumber()
            )}
          </strong>
          . Failure to repay the loan by this date may result in repossession of
          the NFT by the lender.
        </>
      );
    }
  }

  function renderActiveButton() {
    if (
      listing &&
      pubkey &&
      anchorWallet?.publicKey.toBase58() === listing?.borrower.toBase58()
    ) {
      return (
        <RepayButton
          escrow={listing.escrow}
          mint={listing.mint}
          listing={pubkey}
          lender={listing.lender}
        />
      );
    } else if (
      hasExpired &&
      listing &&
      pubkey &&
      anchorWallet?.publicKey.toBase58() === listing?.lender.toBase58()
    ) {
      return (
        <RepossessButton
          escrow={listing.escrow}
          mint={listing.mint}
          listing={pubkey}
        />
      );
    }

    return null;
  }

  function renderListedButton() {
    if (
      listing &&
      pubkey &&
      pubkey.toBase58() === listing?.borrower.toBase58()
    ) {
      return (
        <CancelButton
          escrow={listing.escrow}
          mint={listing.mint}
          listing={pubkey}
        />
      );
    } else if (listing && pubkey) {
      return (
        <LoanButton
          listing={pubkey}
          mint={listing.mint}
          borrower={listing.borrower}
          amount={listing.amount.toNumber()}
          basisPoints={listing.basisPoints}
        />
      );
    }
    return null;
  }

  function renderByState() {
    if (listing === undefined) return null;

    switch (listing.state) {
      case ListingState.Listed:
        return (
          <>
            <View paddingBottom="size-100">
              <Body size="M">
                Lend&nbsp;
                {listing?.amount
                  ? listing.amount.toNumber() / anchor.web3.LAMPORTS_PER_SOL
                  : null}
                &nbsp;SOL for upto&nbsp;
                <strong>
                  {listing?.duration
                    ? utils.toMonths(listing.duration.toNumber())
                    : null}
                  &nbsp;months @&nbsp;
                </strong>
                <strong>
                  {listing?.basisPoints ? listing.basisPoints / 100 : null}%
                </strong>
                &nbsp;APY.
              </Body>
            </View>
            <View marginBottom="size-200">
              <Body>
                <SpectrumLink>
                  <a
                    href={`https://explorer.solana.com/address/${listing?.mint.toBase58()}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View in Explorer
                  </a>
                </SpectrumLink>
              </Body>
            </View>
            <View>{renderListedButton()}</View>
          </>
        );

      case ListingState.Active:
        return (
          <>
            <View paddingBottom="size-100">
              <Body>
                Borrowing&nbsp;
                <strong>
                  {listing.amount.toNumber() / anchor.web3.LAMPORTS_PER_SOL}
                  &nbsp;SOL
                </strong>
                &nbsp;for&nbsp;
                {utils.toMonths(listing.duration.toNumber())}
                &nbsp;months&nbsp;@&nbsp;
                <strong>{listing.basisPoints / 100}%</strong>
                &nbsp;APY.&nbsp;
              </Body>
            </View>
            <View paddingBottom="size-100">
              <Body>
                {utils
                  .totalAmount(
                    listing.amount.toNumber(),
                    listing.startDate.toNumber(),
                    listing.basisPoints
                  )
                  .toFixed(4)}{" "}
                SOL currently owed. Repayment {getRepaymentText()}
              </Body>
            </View>
            <View paddingBottom="size-200">
              <Body>
                <SpectrumLink>
                  <a
                    href={`https://explorer.solana.com/address/${listing?.mint.toBase58()}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View in Explorer
                  </a>
                </SpectrumLink>
              </Body>
            </View>
            <View>{renderActiveButton()}</View>
          </>
        );

      case ListingState.Repaid:
        return <Body>Listing has ended. The loan was repaid.</Body>;

      case ListingState.Cancelled:
        return <Body>Listing cancelled.</Body>;

      case ListingState.Defaulted:
        return (
          <Body>Listing has ended. The NFT was repossessed by the lender.</Body>
        );

      default:
        return null;
    }
  }

  return (
    <Main>
      <Flex direction="row">
        <Flex flex={1} direction="column" justifyContent="center">
          <View padding="size-100">
            <ListingImage uri={metadata?.data.data.uri} />
          </View>
        </Flex>
        <Flex flex={1} direction="column">
          <View padding="size-100">
            <View>
              <Heading size="L">{metadata?.data.data.name}</Heading>
            </View>
            <View paddingY="size-100">
              <Divider size="M" />
            </View>
            {renderByState()}
          </View>
        </Flex>
      </Flex>
    </Main>
  );
};

interface LoanButtonProps {
  mint: anchor.web3.PublicKey;
  borrower: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
  amount: number;
  basisPoints: number;
}

const LoanButton = ({
  mint,
  borrower,
  listing,
  amount,
  basisPoints,
}: LoanButtonProps) => {
  const [open, setDialog] = useState(false);
  const mutation = useLoanMutation(() => setDialog(false));

  return (
    <>
      <Button
        variant="cta"
        minWidth="size-2000"
        onPress={() => setDialog(true)}
      >
        Lend SOL
      </Button>
      <LoanDialog
        open={open}
        loading={mutation.isLoading}
        amount={amount}
        basisPoints={basisPoints}
        onRequestClose={() => setDialog(false)}
        onConfirm={() =>
          mutation.mutate({
            mint,
            borrower,
            listing,
          })
        }
      />
    </>
  );
};

interface CancelButtonProps {
  mint: anchor.web3.PublicKey;
  escrow: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
}

const CancelButton = ({ mint, escrow, listing }: CancelButtonProps) => {
  const [dialog, setDialog] = useState(false);
  const mutation = useCancelMutation(() => setDialog(false));

  return (
    <>
      <Button
        variant="cta"
        minWidth="size-2000"
        onPress={() => setDialog(true)}
      >
        Cancel Listing
      </Button>
      <CancelDialog
        open={dialog}
        loading={mutation.isLoading}
        onRequestClose={() => setDialog(false)}
        onConfirm={() => mutation.mutate({ mint, escrow, listing })}
      />
    </>
  );
};

interface RepayButtonProps extends CancelButtonProps {
  lender: anchor.web3.PublicKey;
}

const RepayButton = ({ mint, escrow, listing, lender }: RepayButtonProps) => {
  const [dialog, setDialog] = useState(false);
  const mutation = useRepaymentMutation(() => setDialog(false));

  return (
    <>
      <Button
        variant="cta"
        minWidth="size-2000"
        onPress={() => setDialog(true)}
      >
        Repay Loan
      </Button>
      <RepayDialog
        open={dialog}
        loading={mutation.isLoading}
        onRequestClose={() => setDialog(false)}
        onConfirm={() =>
          mutation.mutate({
            mint,
            escrow,
            listing,
            lender,
          })
        }
      />
    </>
  );
};

interface RepossessButtonProps {
  mint: anchor.web3.PublicKey;
  escrow: anchor.web3.PublicKey;
  listing: anchor.web3.PublicKey;
}

const RepossessButton = ({ mint, escrow, listing }: RepossessButtonProps) => {
  const [dialog, setDialog] = useState(false);
  const mutation = useRepossessMutation(() => setDialog(false));

  return (
    <>
      <Button
        variant="cta"
        minWidth="size-2000"
        onPress={() => mutation.mutate({ mint, escrow, listing })}
      >
        Repossess Loan
      </Button>
      <RepossessDialog
        open={dialog}
        loading={mutation.isLoading}
        onRequestClose={() => setDialog(false)}
        onConfirm={() =>
          mutation.mutate({
            mint,
            escrow,
            listing,
          })
        }
      />
    </>
  );
};

interface ListingImageProps {
  uri: string | undefined;
}

const ListingImage: React.FC<ListingImageProps> = ({ uri }) => {
  const metadataFileQuery = useMetadataFileQuery(uri);

  return (
    <View
      flex={1}
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

export default Listing;
