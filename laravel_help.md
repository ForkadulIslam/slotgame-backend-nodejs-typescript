# Laravel Integration: Batch Spin Log Sync (High Performance)

To support 100+ spins per second on budget shared hosting, we use a **Queue + Job** strategy. This allows the API to return instantly while the database work happens in the background.

### 1. Database Migration
Ensure you have a `spin_logs` table with proper indexes for fast admin stats.

```php
Schema::create('spin_logs', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('user_id')->index();
    $table->string('game_id')->index();
    $table->decimal('bet', 16, 2);
    $table->decimal('win', 16, 2);
    $table->boolean('is_free_game')->default(false);
    $table->timestamp('created_at')->index(); 
});
```

### 2. Job Implementation
Create `App\Jobs\ProcessSpinLogsBatch.php`. This job handles the bulk database insertion.

```php
namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class ProcessSpinLogsBatch implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $logs;

    public function __construct(array $logs)
    {
        $this->logs = $logs;
    }

    public function handle()
    {
        $dataToInsert = [];

        foreach ($this->logs as $log) {
            $dataToInsert[] = [
                'user_id'     => $log['userId'],
                'game_id'     => $log['gameId'] ?? 'classic',
                'bet'         => $log['bet'],
                'win'         => $log['win'],
                'is_free_game'=> $log['isFreeGame'] ?? false,
                'created_at'  => Carbon::createFromTimestampMs($log['timestamp']),
            ];
        }

        // Use a transaction for ACID compliance
        DB::transaction(function () use ($dataToInsert) {
            // Batch insert in chunks of 500 to stay within MySQL packet limits
            collect($dataToInsert)->chunk(500)->each(function ($chunk) {
                DB::table('spin_logs')->insert($chunk->toArray());
            });
        });
    }
}
```

### 3. Controller Implementation
Create `App\Http\Controllers\Api\SpinLogController.php`. This is a "Fire and Forget" endpoint.

```php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Jobs\ProcessSpinLogsBatch;

class SpinLogController extends Controller
{
    /**
     * Accepts a batch of logs and offloads them to the queue.
     * Response time: <50ms
     */
    public function batchStore(Request $request)
    {
        if (!$request->has('logs') || !is_array($request->logs)) {
            return response()->json(['status' => 'error', 'message' => 'Invalid data'], 400);
        }

        // Dispatch to background queue
        ProcessSpinLogsBatch::dispatch($request->logs);

        return response()->json([
            'status'  => 'success',
            'message' => 'Batch accepted.'
        ]);
    }
}
```

### 4. Why this is safe for 100 SPS:
*   **Zero Locking:** The API controller doesn't touch the database. It only pushes to the queue (Redis/Database queue), preventing PHP process hang-ups.
*   **Data Integrity:** The Node.js worker waits for a `200 OK` before clearing the logs from Redis. If Laravel is down, the logs stay in Redis safely.
*   **No Spikes:** Because the Node.js worker sends batches "one by one" with a delay, the shared hosting PHP pool is never overwhelmed.
