export function formatError(error: any): string {
  if (!error) return '';
  
  const message = error.message || String(error);
  
  // Check for common user rejection patterns in Viem/Wagmi errors
  if (
    message.toLowerCase().includes('user rejected the request') || 
    message.toLowerCase().includes('user denied transaction signature') ||
    error.name === 'UserRejectedRequestError' ||
    error.code === 4001
  ) {
    return 'Request rejected by user';
  }

  // Handle other common errors if needed, otherwise return a shorter version of the message
  if (message.includes('insufficient funds')) {
    return 'Insufficient funds for transaction';
  }

  // Fallback to a cleaner version of the error message if it's too long
  if (message.length > 100) {
    return message.split('\n')[0].split('.')[0] || 'Transaction failed';
  }

  return message;
}
