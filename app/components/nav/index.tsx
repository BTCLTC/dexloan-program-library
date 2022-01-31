import Link from "next/link";
import { useRouter } from "next/router";
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
        <Heading size="L">LoanDex</Heading> {/* LOGO goes here */}
        <ul>
          <li>
            <NavItem href="/">Listings</NavItem>
          </li>
          <li>
            <NavItem href="/borrow">Borrow</NavItem>
          </li>
          <li>
            <NavItem href="/manage">Manage</NavItem>
          </li>
        </ul>
        <ConnectWalletActionButton />
      </div>
    </nav>
  );
};
