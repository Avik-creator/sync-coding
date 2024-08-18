import express, { Request, Response } from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import { SocketEvent, SocketId } from "./types/socket";
import { USER_CONNECTION_STATUS, User } from "./types/User";
import { Server } from "socket.io";
import path from "path";

dotenv.config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

let userSocketMap: User[] = [];

function getUserInRoomById(roomId: string): User[] {
  return userSocketMap.filter((user) => user.roomId === roomId);
}

function getRoomIdUsingSocketId(socketId: string): string {
  const roomId = userSocketMap.find(
    (user) => user.socketId === socketId
  )?.roomId;
  if (!roomId) {
    throw new Error("Room not found");
  }
  return roomId;
}

function getUserBySocketId(socketId: string): User {
  const user = userSocketMap.find((user) => user.socketId === socketId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}
