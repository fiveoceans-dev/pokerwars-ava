export const getWalletPFPIfExists = (profilePicture: string | undefined) => {
  if (!profilePicture) return undefined;

  const looksLikePlaceholder = /identicons\/0$/i.test(profilePicture);
  return looksLikePlaceholder ? undefined : profilePicture;
};
