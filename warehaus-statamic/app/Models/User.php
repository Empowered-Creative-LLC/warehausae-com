<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use App\Notifications\ActivateAccount;
use App\Notifications\PasswordReset;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'super',
        'avatar',
        'preferences',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'super' => 'boolean',
            'preferences' => 'array',
            'last_login' => 'datetime',
        ];
    }

    /**
     * Statamic's Eloquent user wrapper delegates password-reset mail to this
     * model when the method exists. The inherited Laravel trait would send the
     * framework's default notification, which builds route('password.reset') —
     * a route Statamic does not define (it uses its own CP reset routes). Send
     * Statamic's notification instead so the correct reset URL is generated.
     */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new PasswordReset($token));
    }

    public function sendActivateAccountNotification($token): void
    {
        $this->notify(new ActivateAccount($token));
    }
}
