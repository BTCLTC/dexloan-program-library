import React from "react";
import { Link } from "@adobe/react-spectrum";
import * as anchor from "@project-serum/anchor";

interface ExplorerLinkProps {
  address: anchor.web3.PublicKey;
}

export const ExplorerLink: React.FC<ExplorerLinkProps> = ({
  children,
  address,
}) => {
  return (
    <Link>
      <a
        href={`https://explorer.solana.com/address/${address.toBase58()}`}
        target="_blank"
        rel="noreferrer"
        style={{ wordBreak: "break-word" }}
      >
        {children}
      </a>
    </Link>
  );
};
