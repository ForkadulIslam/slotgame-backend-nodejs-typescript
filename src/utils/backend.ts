export async function updateBackendWithUserBalance(userId: string | number, balance: number) {
    const backendApiBaseUrl = process.env.BACKEND_API_BASE_URL;
    if (!backendApiBaseUrl) {
        console.error('BACKEND_API_BASE_URL is not defined in environment variables.');
        throw new Error('Backend API base URL is not configured.');
    }
    try {
        console.log(`[Backend] Syncing balance for User: ${userId}, Balance: ${balance}`);
        const updateApiUrl = `${backendApiBaseUrl}/api/user_balance_update`;
        const balanceUnlock = true;
        
        const response = await fetch(updateApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, balance, balanceUnlock }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody}`);
        }
        return await response.json();
    } catch (error: any) {
        console.error(`Error posting user data for userId ${userId}:`, error.message);
        throw new Error(`Failed to post user data to backend: ${error.message}`);
    }
}
