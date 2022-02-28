import {
  ActionButton,
  Content,
  Dialog,
  DialogContainer,
  Divider,
  Flex,
  Heading as DialogHeading,
  Text,
  View,
} from "@adobe/react-spectrum";
import Help from "@spectrum-icons/workflow/Help";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { Heading } from "../typography";
import { ConnectWalletActionButton } from "../button";
import styles from "./nav.module.css";

interface NavItemProps {
  href: string;
}

const NavItem: React.FC<NavItemProps> = ({ children, href }) => {
  const router = useRouter();

  return (
    <Link href={href}>
      <a
        className={`spectrum-Body spectrum-Body--sizeM ${styles.link} ${
          router.pathname === href ? styles.active : ""
        }`}
      >
        {children}
      </a>
    </Link>
  );
};

export const Nav = () => {
  return (
    <nav className={styles.nav}>
      <div className={styles.navContainer}>
        <View width="size-3000">
          <Heading size="L">dexloan</Heading> {/* LOGO goes here */}
        </View>
        <ul>
          <li>
            <NavItem href="/">Lend</NavItem>
          </li>
          <li>
            <NavItem href="/borrow">Borrow</NavItem>
          </li>
          <li>
            <NavItem href="/manage">Manage</NavItem>
          </li>
        </ul>
        <View width="size-3000">
          <Flex direction="row" justifyContent="end">
            <ConnectWalletActionButton />
            <HowItWorksIcon />
          </Flex>
        </View>
      </div>
    </nav>
  );
};

const HowItWorksIcon = () => {
  const [open, setDialog] = useState(false);

  return (
    <>
      <ActionButton
        aria-label="How it works"
        marginStart="size-100"
        onPress={() => setDialog(true)}
      >
        <Help />
      </ActionButton>
      <DialogContainer isDismissable onDismiss={() => setDialog(false)}>
        {open && (
          <Dialog>
            <DialogHeading>How it works</DialogHeading>
            <Divider />
            <Content>
              <View marginBottom="size-100">
                <Text>
                  1. Select and list your NFT. You can choose the duration and
                  interest rate (% APY). When confirmed, a listing will be
                  created and the NFT will be transferred to an escrow account.
                </Text>
              </View>
              <View marginBottom="size-100">
                <Text>
                  2. The borrower can cancel the listing at any time and
                  re-list, provided the listing is not yet active.
                </Text>
              </View>
              <View marginBottom="size-100">
                <Text>
                  3. When the lender decides to lend, the listed SOL amount will
                  be sent directly to the borrower and the NFT will remain in
                  the escrow. The listing is now active.
                </Text>
              </View>
              <View marginBottom="size-100">
                <Text>
                  4. The borrower may repay the loan at any time and will pay
                  interest on a pro-rata basis. When repayment is made, the
                  total amount including interest will be sent directly to the
                  lender and the NFT will be returned to the borrower.
                </Text>
              </View>
              <View marginBottom="size-100">
                <Text>
                  5. If the borrower fails to repay the loan before the due
                  date, the lender may choose to repossess the NFT. In this
                  case, it will be transferred from escrow to the lender.
                  However, the lender may also choose to wait longer for
                  repayment, and interest will continue to accrue.
                </Text>
              </View>
            </Content>
          </Dialog>
        )}
      </DialogContainer>
    </>
  );
};
