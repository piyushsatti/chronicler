package clock

import "time"

type Clock func() time.Time

func Real() Clock { return time.Now }

func Fixed(t time.Time) Clock {
	return func() time.Time { return t }
}
