# Laravel Integration: Batch Spin Log Sync

To support the Node.js batch worker, you need to implement the following in your Laravel backend.

### 1. Database Migration
Ensure you have a `spin_logs` table.

```php
Schema::create('spin_logs', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained();
    $table->string('game_id');
    $table->decimal('bet', 16, 2);
    $table->decimal('win', 16, 2);
    $table->boolean('is_free_game')->default(false);
    $table->timestamp('created_at'); // Use the timestamp from Node.js
});
```

### 2. API Route
Add this to `routes/api.php`:

```php
use App\Http\Controllers\Api\SpinLogController;

Route::post('/batch_spin_logs', [SpinLogController::class, 'batchStore']);
```

### 3. Controller Implementation
Create `App\Http\Controllers\Api\SpinLogController.php`.

```php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class SpinLogController extends Controller
{
    /**
     * Store a batch of spin logs from the Node.js worker.
     * 
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function batchStore(Request $request)
    {
        $request->validate([
            'logs' => 'required|array',
            'logs.*.userId' => 'required',
            'logs.*.bet' => 'required|numeric',
            'logs.*.win' => 'required|numeric',
        ]);

        $logs = $request->input('logs');
        $dataToInsert = [];

        foreach ($logs as $log) {
            $dataToInsert[] = [
                'user_id'     => $log['userId'],
                'game_id'     => $log['gameId'] ?? 'classic',
                'bet'         => $log['bet'],
                'win'         => $log['win'],
                'is_free_game'=> $log['isFreeGame'] ?? false,
                'created_at'  => Carbon::createFromTimestampMs($log['timestamp']),
            ];
        }

        try {
            // Use chunking if the batch size is extremely large
            DB::table('spin_logs')->insert($dataToInsert);

            return response()->json([
                'status'  => 'success',
                'message' => count($dataToInsert) . ' logs synced successfully.'
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Failed to sync logs: ' . $e.getMessage()
            ], 500);
        }
    }
}
```

### 4. Why this is efficient:
*   **Batch Insert:** Instead of 100 separate SQL queries, Laravel sends a single `INSERT INTO ... VALUES (...), (...), ...` query. This is significantly faster and uses less CPU/Memory on your low-resource server.
*   **Carbon Timestamp:** We convert the JavaScript millisecond timestamp (`timestamp`) into a proper Laravel/MySQL timestamp to maintain accurate history.
