package com.example.lambda;

import com.amazonaws.serverless.exceptions.ContainerInitializationException;
import com.amazonaws.serverless.proxy.internal.LambdaContainerHandler;
import com.amazonaws.serverless.proxy.spring.SpringBootProxyHandlerBuilder;
import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
import com.amazonaws.services.lambda.runtime.Context;

import com.example.JavaServiceApplication;
import java.io.*;

public class StreamLambdaHandler implements RequestStreamHandler {
  private static final LambdaContainerHandler<AwsHttpApiV2ProxyRequest, AwsHttpApiV2ProxyResponse> handler;

  static {
    try {
      handler = new SpringBootProxyHandlerBuilder()
          .defaultProxy()
          .asyncInit()
          .springBootApplication(JavaServiceApplication.class)
          .buildAndInitialize();
    } catch (ContainerInitializationException e) {
      throw new RuntimeException("Could not initialize Spring Boot application", e);
    }
  }

  @Override
  public void handleRequest(InputStream input, OutputStream output, Context context) throws IOException {
    handler.proxyStream(input, output, context);
  }
}
