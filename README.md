# Dexloan Listings

Dexloan's P2P listings smart-contract for escrowless NFT lending, options trading and rentals.

### Background
Dexloan's listings protocol makes use of SPL Token delegation and freezing to secure fully collateralized NFTs without the use of escrow accounts. Through this mechanism we are able offer a variety of fiancial contracts including fully secured loans, exercisable call options and rentals. Users can borrow against the market value of their NFT without ever needing to transfer ownership, offering the possibility to raise liquidity and open short/long positions while maintaining access to NFT gated features. In addition, users can rent out their NFTs to earn passive income while also borrowing against their market value. 
 
### Loans
Loan listings can be created with the following arguments:

- the duration of the loan in seconds
- the annual interest rate in basis points
- the loan amount in lamports

The maturity date of the loan is calculated based on the duration from the moment a lender grants the loan and it becomes active. Once a loan is active the associated NFT will remain frozen until it is either repaid in full or repossessed. While the borrower may repay the loan in full at any time the total interest fee is calculated based on the full duration. If the borrower fails to repay the loan before maturity date the lender may choose to mark the loan as defaulted and repossess the NFT.

#### Liquidations
We do not currently support liquidations but have plans to optionally support this feature in the near future by integrating with on-chain pricing protocols and introducing a fourth `threshold` parameter to loan creation.
 
### Call Options
Call option listings require the following arguments:

- expiry as a unix timestamp
- the cost to buy the option in lamports
- the strike price of the option in lamports

Once a call option is active the NFT will remain frozen until the specified expiry date. The buyer has the right to purchase the NFT for the strike price at any time until the expiry. Creator royalties are respected and paid in full when a call option is exercised.

### Rentals

> Disambiguation: rentals are currently referred to as "hires" throughout the codebase but going forward we will be referring to these as "rentals".  

Rental listings can be created with the following arguments:

- the amount per day in lamports it costs to rent the NFT
- the expiry as a unix timestamp, representing the latest date an NFT can be rented
- (optional) the borrower address if the rental is private

A listed NFT can be rented by specifying a number of days (total amount = days * amount). The fees from rentals are paid into an escrow account where they can be withdrawn by the lender. Once a rental has finished the lender can choose to recover the NFT, withdrawing any outstanding fees from escrow. Borrowers can optionally choose to extend a rental.

Any NFT with a listed or active loan or call option can also be listed for rental. Just as we can borrow money from a bank against the value of a property and also earn passive income by renting out that property, the same can be done for NFTs on Dexloan.

#### Settlement
If an NFT with an active loan or call option is repossessed or bought whilst also being rented out to a third party then settlement ensures all outstanding rental fees are fairly distributed from the escrow balance. As part of settlement the NFT will be transfered from the borrower (i.e. the person renting) to the repossessor/buyer.
