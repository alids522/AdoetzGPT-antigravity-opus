package com.adoetz.gpt.sync;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.mindrot.jbcrypt.BCrypt;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;
import java.util.Properties;
import java.util.UUID;

@CapacitorPlugin(name = "NativePostgresSync")
public class NativePostgresSyncPlugin extends Plugin {
    @PluginMethod
    public void signUp(PluginCall call) {
        runAsync(() -> {
            String username = normalizeUsername(call.getString("username", ""));
            String password = call.getString("password", "");
            JSObject dbConfig = call.getObject("dbConfig", new JSObject());

            if (!username.matches("^[a-z0-9._-]{3,64}$")) {
                call.reject("Username must be 3-64 characters using letters, numbers, dot, dash, or underscore.");
                return;
            }
            if (password.length() < 8) {
                call.reject("Password must be at least 8 characters.");
                return;
            }

            try (Connection connection = openConnection(dbConfig)) {
                String schemaName = schemaName(dbConfig);
                ensurePostgres(connection, schemaName);
                String schema = quoteIdent(schemaName);
                String id = UUID.randomUUID().toString();
                String passwordHash = BCrypt.hashpw(password, BCrypt.gensalt(12));

                try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO " + schema + ".users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?) RETURNING *"
                )) {
                    statement.setString(1, id);
                    statement.setString(2, username);
                    statement.setString(3, username);
                    statement.setString(4, passwordHash);

                    try (ResultSet rows = statement.executeQuery()) {
                        if (!rows.next()) {
                            call.reject("Unable to create user.");
                            return;
                        }

                        try (PreparedStatement stateStatement = connection.prepareStatement(
                            "INSERT INTO " + schema + ".app_states (user_id, state) VALUES (?, '{}'::jsonb)"
                        )) {
                            stateStatement.setString(1, id);
                            stateStatement.executeUpdate();
                        }

                        call.resolve(authPayload(rows, schemaName, null));
                    }
                }
            } catch (SQLException error) {
                if ("23505".equals(error.getSQLState())) {
                    call.reject("Username is already registered.");
                } else {
                    call.reject(error.getMessage());
                }
            } catch (Throwable error) {
                call.reject(error.getClass().getSimpleName() + ": " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void login(PluginCall call) {
        runAsync(() -> {
            String username = normalizeUsername(call.getString("username", ""));
            String password = call.getString("password", "");
            JSObject dbConfig = call.getObject("dbConfig", new JSObject());

            try (Connection connection = openConnection(dbConfig)) {
                String schemaName = schemaName(dbConfig);
                ensurePostgres(connection, schemaName);
                String schema = quoteIdent(schemaName);

                try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT * FROM " + schema + ".users WHERE username = ?"
                )) {
                    statement.setString(1, username);
                    try (ResultSet rows = statement.executeQuery()) {
                        if (!rows.next() || !BCrypt.checkpw(password, normalizeBcryptHash(rows.getString("password_hash")))) {
                            call.reject("Invalid username or password.");
                            return;
                        }

                        String userId = rows.getString("id");
                        JSObject state = null;
                        try (PreparedStatement stateStatement = connection.prepareStatement(
                            "SELECT state::text AS state_text FROM " + schema + ".app_states WHERE user_id = ?"
                        )) {
                            stateStatement.setString(1, userId);
                            try (ResultSet stateRows = stateStatement.executeQuery()) {
                                if (stateRows.next()) {
                                    state = parseState(stateRows.getString("state_text"));
                                }
                            }
                        }

                        call.resolve(authPayload(rows, schemaName, state));
                    }
                }
            } catch (Throwable error) {
                call.reject(error.getClass().getSimpleName() + ": " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void pushState(PluginCall call) {
        runAsync(() -> {
            String token = call.getString("token", "");
            JSObject dbConfig = call.getObject("dbConfig", new JSObject());
            JSObject state = call.getObject("state", new JSObject());

            try (Connection connection = openConnection(dbConfig)) {
                String schemaName = schemaName(dbConfig);
                String userId = userIdFromToken(token, schemaName);
                ensurePostgres(connection, schemaName);
                String schema = quoteIdent(schemaName);

                try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO " + schema + ".app_states (user_id, state, updated_at) " +
                        "VALUES (?, ?::jsonb, NOW()) " +
                        "ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()"
                )) {
                    statement.setString(1, userId);
                    statement.setString(2, state.toString());
                    statement.executeUpdate();
                }

                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            } catch (Throwable error) {
                call.reject(error.getClass().getSimpleName() + ": " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void pullState(PluginCall call) {
        runAsync(() -> {
            String token = call.getString("token", "");
            JSObject dbConfig = call.getObject("dbConfig", new JSObject());

            try (Connection connection = openConnection(dbConfig)) {
                String schemaName = schemaName(dbConfig);
                String userId = userIdFromToken(token, schemaName);
                ensurePostgres(connection, schemaName);
                String schema = quoteIdent(schemaName);
                JSObject result = new JSObject();

                try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT state::text AS state_text FROM " + schema + ".app_states WHERE user_id = ?"
                )) {
                    statement.setString(1, userId);
                    try (ResultSet rows = statement.executeQuery()) {
                        result.put("state", rows.next() ? parseState(rows.getString("state_text")) : null);
                    }
                }

                call.resolve(result);
            } catch (Throwable error) {
                call.reject(error.getClass().getSimpleName() + ": " + error.getMessage());
            }
        });
    }

    private void runAsync(Runnable runnable) {
        execute(runnable);
    }

    private Connection openConnection(JSObject dbConfig) throws SQLException {
        String url = jdbcUrl(dbConfig);
        String user = dbConfig.getString("user", "").trim();
        String password = dbConfig.getString("password", "");

        if (user.isEmpty()) throw new SQLException("Database user is required.");

        Properties props = new Properties();
        props.setProperty("user", user);
        props.setProperty("password", password);
        // Disable maxResultBuffer to prevent ManagementFactory usage on Android
        props.setProperty("maxResultBuffer", "-1");
        return DriverManager.getConnection(url, props);
    }

    private String jdbcUrl(JSObject dbConfig) throws SQLException {
        String databaseUrl = dbConfig.getString("databaseUrl", "").trim();
        String database = dbConfig.getString("database", "").trim();
        String port = dbConfig.getString("port", "").trim();

        if (databaseUrl.isEmpty()) throw new SQLException("Database URL is required.");

        if (databaseUrl.startsWith("jdbc:postgresql://")) return databaseUrl;
        if (databaseUrl.startsWith("postgres://")) return "jdbc:postgresql://" + databaseUrl.substring("postgres://".length());
        if (databaseUrl.startsWith("postgresql://")) return "jdbc:postgresql://" + databaseUrl.substring("postgresql://".length());

        String host = databaseUrl.replaceFirst("/+$", "");
        if (database.isEmpty()) throw new SQLException("Database name is required.");
        if (host.contains("?")) {
            String[] parts = host.split("\\?", 2);
            return "jdbc:postgresql://" + parts[0] + "/" + database + "?" + parts[1];
        }
        return "jdbc:postgresql://" + host + (port.isEmpty() ? "" : ":" + port) + "/" + database;
    }

    private void ensurePostgres(Connection connection, String schemaName) throws SQLException {
        String schema = quoteIdent(schemaName);
        try (Statement statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA IF NOT EXISTS " + schema);
            statement.execute(
                "CREATE TABLE IF NOT EXISTS " + schema + ".users (" +
                    "id TEXT PRIMARY KEY, " +
                    "username TEXT UNIQUE NOT NULL, " +
                    "email TEXT UNIQUE, " +
                    "display_name TEXT NOT NULL, " +
                    "password_hash TEXT NOT NULL, " +
                    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), " +
                    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" +
                ")"
            );
            statement.execute(
                "CREATE TABLE IF NOT EXISTS " + schema + ".app_states (" +
                    "user_id TEXT PRIMARY KEY REFERENCES " + schema + ".users(id) ON DELETE CASCADE, " +
                    "state JSONB NOT NULL DEFAULT '{}'::jsonb, " +
                    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), " +
                    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" +
                ")"
            );
        }
    }

    private String schemaName(JSObject dbConfig) {
        String schemaName = dbConfig.getString("schemaName", "adoetzgpt").trim();
        return schemaName.isEmpty() ? "adoetzgpt" : schemaName;
    }

    private String quoteIdent(String value) throws SQLException {
        if (!value.matches("^[A-Za-z_][A-Za-z0-9_]*$")) {
            throw new SQLException("Database schema must use letters, numbers, and underscores, and cannot start with a number.");
        }
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private String tokenFor(String userId, String schemaName) {
        return "native-postgres:" + schemaName + ":" + userId;
    }

    private String userIdFromToken(String token, String expectedSchema) throws SQLException {
        String prefix = "native-postgres:" + expectedSchema + ":";
        if (!token.startsWith(prefix)) throw new SQLException("Invalid Android Postgres session. Please log in again.");
        return token.substring(prefix.length());
    }

    /**
     * Normalize bcrypt hash prefix for cross-platform compatibility.
     * Web bcryptjs generates $2b$ hashes; Android jBCrypt 0.4 only supports $2a$.
     * The algorithms are cryptographically identical — $2b$ was a version bump in OpenBSD.
     */
    private String normalizeBcryptHash(String hash) {
        if (hash != null && hash.startsWith("$2b$")) {
            return "$2a$" + hash.substring(4);
        }
        if (hash != null && hash.startsWith("$2y$")) {
            return "$2a$" + hash.substring(4);
        }
        return hash;
    }

    private JSObject authPayload(ResultSet row, String schemaName, JSObject state) throws SQLException, JSONException {
        JSObject result = new JSObject();
        result.put("user", publicUser(row));
        result.put("token", tokenFor(row.getString("id"), schemaName));
        result.put("state", state);
        return result;
    }

    private JSObject publicUser(ResultSet row) throws SQLException, JSONException {
        String username = row.getString("username");
        String displayName = row.getString("display_name");
        JSObject user = new JSObject();
        user.put("id", row.getString("id"));
        user.put("username", username);
        user.put("displayName", displayName == null || displayName.isEmpty() ? username : displayName);
        return user;
    }

    private JSObject parseState(String stateText) {
        if (stateText == null || stateText.isEmpty()) return null;
        try {
            return new JSObject(stateText);
        } catch (JSONException error) {
            return null;
        }
    }
}
