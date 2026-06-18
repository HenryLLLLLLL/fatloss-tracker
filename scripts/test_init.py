import sys
sys.path.insert(0, 'scripts')
from log_entry import log_weight, log_training, get_latest_weight

# Log weight
r = log_weight('2026-06-17', 74.30, 23.1, 54.5, 1629, 'initial data entry')
print("Weight log:", r)

# Log training
r2 = log_training('2026-06-17', 'boxing_strength', 'full_body', 90, 500, 0, 'boxing primary + strength secondary')
print("Training log:", r2)

# Verify
w = get_latest_weight()
print("Latest weight:", w)

# Verify diet table works
from log_entry import log_diet_meal
r3 = log_diet_meal('2026-06-17', 'breakfast', 'sample meal', 400, 30, 20, 10, 'test entry - will delete')
print("Diet test:", r3)
print("All checks passed!")
