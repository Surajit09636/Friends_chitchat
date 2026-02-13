import { Link } from "react-router-dom";
import "../styles/landing.css";

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing__nav">
        <div className="landing__brand">
          <span className="brand__mark">Friend's chitchat</span>
          <span className="brand__tag">Real-time, human-first conversations</span>
        </div>
        <div className="landing__nav-actions">
          <Link className="landing__link" to="/login">
            Log in
          </Link>
          <Link className="landing__button landing__button--primary" to="/signup">
            Sign up
          </Link>
        </div>
      </header>

      <main className="landing__hero">
        <section className="landing__copy">
          <p className="landing__eyebrow">Messaging, refined</p>
          <h1>Build closer chats without the noise.</h1>
          <p className="landing__lead">
            Create a space where conversations stay focused, fast, and easy to
            pick up. Login if you already have an account, or create one in
            seconds.
          </p>
          <div className="landing__actions">
            <Link className="landing__button landing__button--primary" to="/signup">
              Create account
            </Link>
            <Link className="landing__button landing__button--ghost" to="/login">
              Log in
            </Link>
          </div>
          <div className="landing__meta">
            <div className="landing__chip">Fast setup</div>
            <div className="landing__chip">Email verification</div>
            <div className="landing__chip">Session security</div>
          </div>
        </section>

        <aside className="landing__panel" aria-hidden="true">
          <div className="panel__card panel__card--primary">
            <div className="panel__header">
              <span>Today</span>
              <span className="panel__status">Online</span>
            </div>
            <div className="panel__bubble panel__bubble--left">
              Hey! Ready for the sprint sync?
            </div>
            <div className="panel__bubble panel__bubble--right">
              Yep. Dropping notes in 2 mins.
            </div>
            <div className="panel__bubble panel__bubble--left">
              Perfect — I will start the room.
            </div>
          </div>

          <div className="panel__card panel__card--secondary">
            <h3>Get started</h3>
            <p>Choose your path and jump in.</p>
            <div className="panel__actions">
              <Link className="landing__button landing__button--primary" to="/signup">
                Sign up
              </Link>
              <Link className="landing__button landing__button--ghost" to="/login">
                Log in
              </Link>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
